'use client';

// Vault primitives: EVM wallet detection, deterministic signing, key derivation,
// AES-GCM symmetric encryption, and per-tab key caching.

export const VAULT_VERSION = 1;

export interface EvmProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

interface InjectedWindow {
  okxwallet?: EvmProvider;
  ethereum?: EvmProvider;
}

export function getEvmProvider(): EvmProvider | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as InjectedWindow;
  return w.okxwallet ?? w.ethereum ?? null;
}

export function buildUnlockMessage(address: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return [
    'Unlock crypto-dashboard',
    `Domain: ${origin}`,
    `Address: ${address}`,
    `Version: ${VAULT_VERSION}`,
  ].join('\n');
}

export async function requestAccount(provider: EvmProvider): Promise<string> {
  const accounts = (await provider.request({
    method: 'eth_requestAccounts',
  })) as string[];
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('未授权账户');
  }
  return accounts[0].toLowerCase();
}

export async function signUnlockMessage(
  provider: EvmProvider,
  address: string
): Promise<string> {
  const sig = (await provider.request({
    method: 'personal_sign',
    params: [buildUnlockMessage(address), address],
  })) as string;
  if (typeof sig !== 'string' || !sig.startsWith('0x')) {
    throw new Error('签名格式不正确');
  }
  return sig;
}

async function importAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function deriveKeyFromSignature(
  signature: string
): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(signature);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return importAesKey(digest);
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export interface VaultPayload {
  ciphertext: string;
  iv: string;
}

export async function encryptString(
  key: CryptoKey,
  plaintext: string
): Promise<VaultPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);
  return { ciphertext: toBase64(ct), iv: toBase64(iv) };
}

export async function decryptString(
  key: CryptoKey,
  payload: VaultPayload
): Promise<string> {
  const ct = fromBase64(payload.ciphertext);
  const iv = fromBase64(payload.iv);
  const ctCopy = new Uint8Array(ct);
  const ivCopy = new Uint8Array(iv);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivCopy },
    key,
    ctCopy
  );
  return new TextDecoder().decode(plain);
}

// Per-tab cache. Raw key bytes live only in sessionStorage so closing the
// tab forgets them; a different tab requires a fresh signature.
const SESSION_KEY_PREFIX = 'cd-vault-key-';

function sessionStorageKey(address: string): string {
  return SESSION_KEY_PREFIX + address.toLowerCase();
}

export async function cacheKeyInSession(
  address: string,
  key: CryptoKey
): Promise<void> {
  if (typeof sessionStorage === 'undefined') return;
  const raw = await crypto.subtle.exportKey('raw', key);
  sessionStorage.setItem(sessionStorageKey(address), toBase64(raw));
}

export async function loadKeyFromSession(
  address: string
): Promise<CryptoKey | null> {
  if (typeof sessionStorage === 'undefined') return null;
  const b64 = sessionStorage.getItem(sessionStorageKey(address));
  if (!b64) return null;
  try {
    const raw = fromBase64(b64);
    const buf = new ArrayBuffer(raw.byteLength);
    new Uint8Array(buf).set(raw);
    return await importAesKey(buf);
  } catch {
    return null;
  }
}

export function clearSessionKeys(): void {
  if (typeof sessionStorage === 'undefined') return;
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(SESSION_KEY_PREFIX)) sessionStorage.removeItem(k);
  }
}
