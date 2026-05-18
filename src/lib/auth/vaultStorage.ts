'use client';

import type { VaultPayload } from './walletVault';

const BLOB_KEY = 'crypto-dashboard-vault-blob';
export const PLAINTEXT_KEYS_KEY = 'crypto-dashboard-api-keys';
// Legacy flag from the opt-in vault era; clean it up on first load.
const LEGACY_FLAG_KEY = 'crypto-dashboard-vault-enabled';

export interface VaultBlob {
  version: number;
  address: string;
  payload: VaultPayload;
  canary: VaultPayload;
}

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export function readVaultBlob(): VaultBlob | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  ls.removeItem(LEGACY_FLAG_KEY);
  const raw = ls.getItem(BLOB_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VaultBlob;
  } catch {
    return null;
  }
}

export function writeVaultBlob(blob: VaultBlob): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.setItem(BLOB_KEY, JSON.stringify(blob));
}

export function clearVault(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.removeItem(BLOB_KEY);
  ls.removeItem(LEGACY_FLAG_KEY);
}

export function readPlaintextKeys(): Record<string, unknown> | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  const raw = ls.getItem(PLAINTEXT_KEYS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    return (parsed.state ?? (parsed as Record<string, unknown>)) || null;
  } catch {
    return null;
  }
}

export function clearPlaintextKeys(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.removeItem(PLAINTEXT_KEYS_KEY);
}
