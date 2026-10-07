import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { redis } from '@/lib/cache/upstash';
import type { WalletBalance, WalletConfig } from '@/types/onchain';
import type { OkxWeb3Creds } from './okxWeb3';
import { isSuccessfulWallet, normalizedWalletAddress, ONCHAIN_FRESH_MS, ONCHAIN_SERVER_RETENTION_MS, walletChains } from './cachePolicy';

interface CacheEntry {
  data: WalletBalance;
  updatedAt: number;
  refreshError?: string;
  retryAt?: number;
}

export interface WalletCacheStore {
  read(key: string): Promise<CacheEntry | null>;
  write(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void>;
  acquire(key: string, token: string): Promise<boolean>;
  release(key: string, token: string): Promise<void>;
}

type Refresh = () => Promise<WalletBalance>;
type Schedule = (work: () => Promise<void>) => void;
const LOCK_SECONDS = 50;
const RETRY_MS = 60_000;

export function buildOnchainCacheKey(
  wallet: WalletConfig,
  receipts: Array<{ chainId: string; tokenAddress: string }>,
  creds: OkxWeb3Creds
): string {
  const identity = [
    normalizedWalletAddress(wallet.address), walletChains(wallet),
    [...new Set(receipts.map((row) => `${row.chainId}:${row.tokenAddress.toLowerCase()}`))].sort(),
    creds.apiKey || process.env.OKX_WEB3_API_KEY || '',
    creds.apiSecret || process.env.OKX_WEB3_API_SECRET || '',
    creds.passphrase || process.env.OKX_WEB3_PASSPHRASE || '',
    creds.projectId || process.env.OKX_WEB3_PROJECT_ID || '',
    process.env.ETHEREUM_RPC_URL || '', process.env.SOLANA_RPC_URL || '',
  ];
  return `onchain:v1:${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
}

function response(entry: CacheEntry, wallet: WalletConfig, refreshing = false, source: 'live' | 'server' = 'server'): WalletBalance {
  return { ...entry.data, walletId: wallet.id, walletName: wallet.name, address: wallet.address,
    chains: walletChains(wallet), dataUpdatedAt: entry.updatedAt,
    cache: { source, refreshing, refreshError: entry.refreshError } };
}

export class OnchainWalletCache {
  private inFlight = new Map<string, Promise<WalletBalance>>();

  constructor(private store: WalletCacheStore, private now = Date.now) {}

  async get(key: string, wallet: WalletConfig, load: Refresh, schedule: Schedule, force = false): Promise<WalletBalance> {
    const stored = await this.store.read(key).catch(() => null);
    const entry = stored && this.now() - stored.updatedAt < ONCHAIN_SERVER_RETENTION_MS ? stored : null;
    if (entry && !force && this.now() - entry.updatedAt < ONCHAIN_FRESH_MS && !entry.refreshError) {
      return response(entry, wallet);
    }
    if (entry && !force && entry.retryAt && entry.retryAt > this.now()) return response(entry, wallet);

    if (entry && !force) {
      const token = randomUUID();
      const acquired = await this.store.acquire(key, token);
      if (acquired) {
        try {
          schedule(async () => { await this.refresh(key, wallet, load, entry, token); });
        } catch (error) {
          await this.store.release(key, token);
          throw error;
        }
      }
      return response(entry, wallet, true);
    }

    const active = this.inFlight.get(key);
    if (active) {
      const value = await active;
      return { ...value, walletId: wallet.id, walletName: wallet.name, address: wallet.address };
    }
    const token = randomUUID();
    if (await this.store.acquire(key, token)) return this.refresh(key, wallet, load, entry, token);
    // A forced refresh may join a background refresh running in another instance.
    const startedAt = this.now();
    for (let attempt = 0; attempt < 72; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const latest = await this.store.read(key).catch(() => null);
      if (latest && (latest.updatedAt >= startedAt || latest.retryAt && latest.retryAt > startedAt)) {
        return response(latest, wallet);
      }
    }
    if (entry) return response(entry, wallet, true);
    return { walletId: wallet.id, walletName: wallet.name, address: wallet.address, chains: walletChains(wallet),
      balances: [], totalUsdValue: 0, error: '钱包正在更新，请稍后重试' };
  }

  private async refresh(key: string, wallet: WalletConfig, load: Refresh, previous: CacheEntry | null, token: string): Promise<WalletBalance> {
    const work = (async () => {
      try {
        const data = await load();
        if (!isSuccessfulWallet(data)) throw new Error(data.error || data.dataQuality?.errors.join('；') || '钱包数据不完整');
        const entry: CacheEntry = { data, updatedAt: this.now() };
        await this.store.write(key, entry, ONCHAIN_SERVER_RETENTION_MS / 1000).catch(() => undefined);
        return response(entry, wallet, false, 'live');
      } catch (error) {
        const message = error instanceof Error ? error.message : '链上数据更新失败';
        if (previous) {
          const entry = { ...previous, refreshError: message, retryAt: this.now() + RETRY_MS };
          const remainingSeconds = Math.ceil((previous.updatedAt + ONCHAIN_SERVER_RETENTION_MS - this.now()) / 1000);
          if (remainingSeconds > 0) await this.store.write(key, entry, remainingSeconds).catch(() => undefined);
          return response(entry, wallet);
        }
        return { walletId: wallet.id, walletName: wallet.name, address: wallet.address, chains: walletChains(wallet),
          balances: [], totalUsdValue: 0, error: message, dataQuality: { complete: false, errors: [message] } };
      } finally {
        await this.store.release(key, token).catch(() => undefined);
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, work);
    return work;
  }
}

// Local development and Redis outages still have bounded in-process caching.
const memory = new Map<string, { entry: CacheEntry; expiresAt: number }>();
const locks = new Map<string, { token: string; expiresAt: number }>();
const store: WalletCacheStore = {
  async read(key) {
    if (redis) {
      try {
        const entry = await redis.get<CacheEntry>(key);
        if (entry) return entry;
      } catch { /* Use the local last-good entry. */ }
    }
    const row = memory.get(key);
    if (row && row.expiresAt > Date.now()) return row.entry;
    memory.delete(key);
    return null;
  },
  async write(key, entry, ttlSeconds) {
    memory.delete(key);
    memory.set(key, { entry, expiresAt: Date.now() + ttlSeconds * 1000 });
    if (memory.size > 200) memory.delete(memory.keys().next().value!);
    if (redis) await redis.set(key, entry, { ex: ttlSeconds });
  },
  async acquire(key, token) {
    if (redis) {
      try { return (await redis.set(`${key}:lock`, token, { nx: true, ex: LOCK_SECONDS })) === 'OK'; }
      catch { /* Redis is unavailable; coordinate this instance locally. */ }
    }
    const lock = locks.get(key);
    if (lock && lock.expiresAt > Date.now()) return false;
    locks.set(key, { token, expiresAt: Date.now() + LOCK_SECONDS * 1000 });
    return true;
  },
  async release(key, token) {
    if (redis) {
      await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", [`${key}:lock`], [token]).catch(() => undefined);
    }
    if (locks.get(key)?.token === token) locks.delete(key);
  },
};

export const onchainWalletCache = new OnchainWalletCache(store);
