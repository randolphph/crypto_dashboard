'use client';

import type { WalletBalance, WalletConfig } from '@/types/onchain';
import { isSuccessfulWallet, normalizedWalletAddress, ONCHAIN_BROWSER_RETENTION_MS, walletChains } from './cachePolicy';

const DB_NAME = 'crypto-dashboard-onchain-cache';
const STORE = 'wallets';
interface StoredWallet { key: string; data: WalletBalance; expiresAt: number }
let dbPromise: Promise<IDBDatabase> | null = null;

export async function browserSourceScope(owner: string, credentialValues: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([owner.toLowerCase(), credentialValues]));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function browserWalletKey(scope: string, wallet: WalletConfig, receipts: Array<{ chainId: string; tokenAddress: string }>): string {
  return JSON.stringify([1, scope, normalizedWalletAddress(wallet.address), walletChains(wallet),
    [...new Set(receipts.map((row) => `${row.chainId}:${row.tokenAddress.toLowerCase()}`))].sort()]);
}

export function restoreBrowserWallet(row: StoredWallet | undefined, wallet: WalletConfig, now = Date.now()): WalletBalance | null {
  if (!row || row.expiresAt <= now || !row.data.dataUpdatedAt ||
    now - row.data.dataUpdatedAt >= ONCHAIN_BROWSER_RETENTION_MS || !isSuccessfulWallet(row.data)) return null;
  return { ...row.data, walletId: wallet.id, walletName: wallet.name, address: wallet.address, chains: walletChains(wallet),
    cache: { source: 'browser', refreshing: false } };
}

export function mergeWalletResults(incoming: WalletBalance[], previous: WalletBalance[] = []): WalletBalance[] {
  const oldById = new Map(previous.map((wallet) => [wallet.walletId, wallet]));
  return incoming.map((wallet) => {
    const old = oldById.get(wallet.walletId);
    if (!old || !isSuccessfulWallet(old) || !old.dataUpdatedAt || Date.now() - old.dataUpdatedAt >= ONCHAIN_BROWSER_RETENTION_MS) return wallet;
    if (!isSuccessfulWallet(wallet)) {
      return { ...old, cache: { source: old.cache?.source ?? 'browser', refreshing: false,
        refreshError: wallet.error || wallet.dataQuality?.errors.join('；') || '更新失败，显示缓存' } };
    }
    // A delayed response from an older refresh must not replace newer data.
    return old.dataUpdatedAt > (wallet.dataUpdatedAt ?? 0) ? old : wallet;
  });
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: 'key' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = null; reject(request.error); };
  });
  return dbPromise;
}

export async function readBrowserWallets(scope: string, wallets: WalletConfig[], receipts: Array<{ chainId: string; tokenAddress: string }>): Promise<WalletBalance[] | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const store = tx.objectStore(STORE);
  const results = await Promise.all(wallets.map((wallet) => new Promise<WalletBalance | null>((resolve, reject) => {
    const request = store.get(browserWalletKey(scope, wallet, receipts));
    request.onsuccess = () => resolve(restoreBrowserWallet(request.result, wallet));
    request.onerror = () => reject(request.error);
  })));
  if (!results.some(Boolean)) return null;
  return results.map((value, index) => value ?? {
    walletId: wallets[index].id, walletName: wallets[index].name, address: wallets[index].address,
    chains: walletChains(wallets[index]), balances: [], totalUsdValue: 0, error: '正在获取钱包资产',
  });
}

export async function writeBrowserWallets(scope: string, wallets: WalletConfig[], receipts: Array<{ chainId: string; tokenAddress: string }>, data: WalletBalance[]): Promise<void> {
  const db = await openDb();
  const configs = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const wallet of data) {
      const config = configs.get(wallet.walletId);
      if (!config || !isSuccessfulWallet(wallet) || !wallet.dataUpdatedAt || wallet.cache?.refreshError) continue;
      const row: StoredWallet = { key: browserWalletKey(scope, config, receipts),
        data: { ...wallet, cache: { source: 'browser', refreshing: false } },
        expiresAt: wallet.dataUpdatedAt + ONCHAIN_BROWSER_RETENTION_MS };
      const current = store.get(row.key);
      current.onsuccess = () => {
        const previous = current.result as StoredWallet | undefined;
        if (!previous || (previous.data.dataUpdatedAt ?? 0) <= wallet.dataUpdatedAt!) store.put(row);
      };
    }
    // This database is separate from historical snapshots; prune only cache.
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      if ((row.value as StoredWallet).expiresAt <= Date.now()) row.delete();
      row.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
