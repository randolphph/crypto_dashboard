'use client';

import type { SnapshotPayload } from '@/types/snapshot';

// IndexedDB-backed snapshot store. Replaces the home-server SQLite that used
// to back the snapshot pipeline. One row per (wallet, timestamp). Wallets are
// kept partitioned so a user who swaps between vault addresses sees only
// their own history.

const DB_NAME = 'crypto-dashboard-snapshots';
const DB_VERSION = 1;
const STORE = 'snapshots';

interface StoredSnapshot {
  id?: number;
  wallet: string;
  timestamp: number;
  payload: SnapshotPayload;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('wallet_ts', ['wallet', 'timestamp'], {
          unique: false,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function walletRange(wallet: string): IDBKeyRange {
  const w = wallet.toLowerCase();
  return IDBKeyRange.bound([w, 0], [w, Number.MAX_SAFE_INTEGER]);
}

export async function appendSnapshot(payload: SnapshotPayload): Promise<void> {
  const db = await openDb();
  const row: StoredSnapshot = {
    wallet: payload.wallet.toLowerCase(),
    timestamp: payload.timestamp,
    payload,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface SnapshotStats {
  count: number;
  firstTs: number | null;
  lastTs: number | null;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}

export async function getStats(wallet: string): Promise<SnapshotStats> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readonly');
  const idx = tx.objectStore(STORE).index('wallet_ts');
  const range = walletRange(wallet);

  const count = await promisifyRequest(idx.count(range));

  const firstTs = await new Promise<number | null>((resolve, reject) => {
    const req = idx.openCursor(range, 'next');
    req.onsuccess = () => {
      const c = req.result;
      resolve(c ? (c.value as StoredSnapshot).timestamp : null);
    };
    req.onerror = () => reject(req.error);
  });
  const lastTs = await new Promise<number | null>((resolve, reject) => {
    const req = idx.openCursor(range, 'prev');
    req.onsuccess = () => {
      const c = req.result;
      resolve(c ? (c.value as StoredSnapshot).timestamp : null);
    };
    req.onerror = () => reject(req.error);
  });

  let storageUsageBytes: number | null = null;
  let storageQuotaBytes: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      storageUsageBytes = est.usage ?? null;
      storageQuotaBytes = est.quota ?? null;
    } catch {
      // ignore
    }
  }

  return { count, firstTs, lastTs, storageUsageBytes, storageQuotaBytes };
}

export async function getSnapshots(
  wallet: string,
  opts: { fromTs?: number; toTs?: number } = {}
): Promise<SnapshotPayload[]> {
  const db = await openDb();
  const w = wallet.toLowerCase();
  const lo = opts.fromTs ?? 0;
  const hi = opts.toTs ?? Number.MAX_SAFE_INTEGER;
  const range = IDBKeyRange.bound([w, lo], [w, hi]);
  const out: SnapshotPayload[] = [];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('wallet_ts').openCursor(range);
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        out.push((c.value as StoredSnapshot).payload);
        c.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
  return out;
}

export async function clearWallet(wallet: string): Promise<number> {
  const db = await openDb();
  const w = wallet.toLowerCase();
  const range = walletRange(wallet);
  let deleted = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const idx = store.index('wallet_ts');
    const req = idx.openCursor(range);
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        if ((c.value as StoredSnapshot).wallet === w) {
          c.delete();
          deleted++;
        }
        c.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
  return deleted;
}

// Bulk import. Skips rows whose (wallet, timestamp) already exists so the
// same JSON can be re-imported without ballooning the store.
export async function importSnapshots(
  snapshots: SnapshotPayload[]
): Promise<{ inserted: number; skipped: number }> {
  if (snapshots.length === 0) return { inserted: 0, skipped: 0 };
  const db = await openDb();

  // Phase 1 — read existing (wallet, ts) set.
  const existing = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('wallet_ts').openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        const row = c.value as StoredSnapshot;
        existing.add(`${row.wallet}@${row.timestamp}`);
        c.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });

  // Phase 2 — write only the new ones.
  let inserted = 0;
  let skipped = 0;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const snap of snapshots) {
      const w = snap.wallet.toLowerCase();
      const key = `${w}@${snap.timestamp}`;
      if (existing.has(key)) {
        skipped++;
        continue;
      }
      existing.add(key);
      store.add({ wallet: w, timestamp: snap.timestamp, payload: snap });
      inserted++;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { inserted, skipped };
}
