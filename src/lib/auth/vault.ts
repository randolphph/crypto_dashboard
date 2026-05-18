'use client';

import {
  useApiKeyStore,
  emptyKeys,
  extractApiKeys,
  type ApiKeys,
} from '@/stores/apiKeyStore';
import { useVaultStore } from '@/stores/vaultStore';
import {
  readVaultBlob,
  writeVaultBlob,
  clearVault,
  readPlaintextKeys,
  clearPlaintextKeys,
  type VaultBlob,
} from './vaultStorage';
import {
  VAULT_VERSION,
  cacheKeyInSession,
  clearSessionKeys,
  decryptString,
  deriveKeyFromSignature,
  encryptString,
  getEvmProvider,
  loadKeyFromSession,
  requestAccount,
  signUnlockMessage,
} from './walletVault';

const CANARY_PLAINTEXT = 'cd-vault-canary-v1';

let currentKey: CryptoKey | null = null;
let bridgeReady = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;

function applyState(state: Partial<ApiKeys>) {
  useApiKeyStore.getState().setKeys({ ...emptyKeys, ...state });
}

async function decryptBlob(
  key: CryptoKey,
  blob: VaultBlob
): Promise<ApiKeys> {
  const canary = await decryptString(key, blob.canary);
  if (canary !== CANARY_PLAINTEXT) throw new Error('canary mismatch');
  const json = await decryptString(key, blob.payload);
  return { ...emptyKeys, ...(JSON.parse(json) as Partial<ApiKeys>) };
}

async function persistEncrypted(key: CryptoKey, address: string): Promise<void> {
  const state = extractApiKeys(useApiKeyStore.getState());
  const payload = await encryptString(key, JSON.stringify(state));
  const canary = await encryptString(key, CANARY_PLAINTEXT);
  writeVaultBlob({ version: VAULT_VERSION, address, payload, canary });
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, 200);
}

async function persistNow(): Promise<void> {
  const v = useVaultStore.getState();
  if (v.status !== 'authed' || !currentKey || !v.address) return;
  await persistEncrypted(currentKey, v.address);
}

function subscribePersist(): void {
  if (unsubscribe) return;
  unsubscribe = useApiKeyStore.subscribe(() => {
    if (!bridgeReady) return;
    schedulePersist();
  });
}

// Bootstrap on first client render. Tries to silently restore the session via
// the per-tab cached key; otherwise marks the app as needing login.
let bootstrapped = false;
export async function bootstrapVault(): Promise<void> {
  if (typeof window === 'undefined' || bootstrapped) return;
  bootstrapped = true;

  try {
    const blob = readVaultBlob();
    if (blob) {
      const key = await loadKeyFromSession(blob.address);
      if (key) {
        try {
          const state = await decryptBlob(key, blob);
          applyState(state);
          currentKey = key;
          useVaultStore.setState({
            status: 'authed',
            address: blob.address,
            error: null,
          });
          return;
        } catch {
          // session key stale — fall through to unauth
        }
      }
    }
    useVaultStore.setState({ status: 'unauth', error: null });
  } finally {
    bridgeReady = true;
    subscribePersist();
  }
}

// Wallet login. Handles three cases in one flow:
//   1. Fresh user, no plaintext, no blob → initialize empty vault
//   2. Returning user with plaintext keys (pre-vault era) → migrate to blob
//   3. Returning user with existing blob → decrypt and load
export async function loginVault(): Promise<void> {
  const provider = getEvmProvider();
  if (!provider) {
    useVaultStore.setState({
      status: 'unauth',
      error: '未检测到 EVM 钱包，请安装 MetaMask / OKX Wallet / Rabby 等',
    });
    return;
  }

  useVaultStore.setState({ status: 'unlocking', error: null });
  try {
    const address = await requestAccount(provider);
    const sig = await signUnlockMessage(provider, address);
    const key = await deriveKeyFromSignature(sig);

    const blob = readVaultBlob();
    if (blob) {
      if (address !== blob.address) {
        throw new Error(
          `钱包不匹配：当前 ${address.slice(0, 8)}…，加密时 ${blob.address.slice(0, 8)}…`
        );
      }
      const state = await decryptBlob(key, blob);
      applyState(state);
    } else {
      // No blob yet — migrate plaintext (if any), then create encrypted blob.
      const plain = readPlaintextKeys() as Partial<ApiKeys> | null;
      if (plain) {
        applyState(plain);
        clearPlaintextKeys();
      }
      await persistEncrypted(key, address);
    }

    await cacheKeyInSession(address, key);
    currentKey = key;
    useVaultStore.setState({ status: 'authed', address, error: null });
  } catch (e) {
    useVaultStore.setState({
      status: 'unauth',
      error: e instanceof Error ? e.message : '登录失败',
    });
    throw e;
  }
}

// Clear the in-memory key + session cache. Encrypted blob stays on disk so
// the user can log back in.
export function logoutVault(): void {
  clearSessionKeys();
  currentKey = null;
  useApiKeyStore.getState().clearAll();
  useVaultStore.setState({ status: 'unauth', address: null, error: null });
}

// Nuclear option: wipe everything. After this the user effectively starts
// fresh and can bind a new wallet.
export function resetVault(): void {
  clearVault();
  clearPlaintextKeys();
  clearSessionKeys();
  currentKey = null;
  useApiKeyStore.getState().clearAll();
  useVaultStore.setState({ status: 'unauth', address: null, error: null });
}
