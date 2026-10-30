'use client';

import { compactAllocationHistory, type AllocationObservation } from './allocationHistory';
const DB_NAME = 'crypto-dashboard-allocation-history', STORE = 'observations';
interface StoredObservation extends AllocationObservation { wallet: string }
const observation = (row: StoredObservation): AllocationObservation => row.paused ? { timestamp: row.timestamp, paused: true }
  : { timestamp: row.timestamp, allocation: row.allocation, ...(row.quality === 'estimated' ? { quality: 'estimated' as const } : {}) };
let database: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: ['wallet', 'timestamp'] });
      request.onsuccess = () => resolve(request.result);request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('历史记录数据库正等待其他页面关闭'));
    }).catch(error => { database = null;throw error; });
  }
  return database;
}
const range = (wallet: string) => IDBKeyRange.bound([wallet.toLowerCase(), 0], [wallet.toLowerCase(), Number.MAX_SAFE_INTEGER]);
export async function readAllocationHistory(wallet: string): Promise<AllocationObservation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).getAll(range(wallet));
    request.onsuccess = () => resolve((request.result as StoredObservation[]).map(observation));
    request.onerror = () => reject(request.error);
  });
}
/** Read/compact/write in one transaction so concurrent tabs cannot overwrite one another's observations. */
export async function writeAllocationHistory(wallet: string, incoming: AllocationObservation[]): Promise<AllocationObservation[]> {
  const db = await openDb(), owner = wallet.toLowerCase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE), request = store.getAll(range(owner));
    let points: AllocationObservation[] = [];
    request.onsuccess = () => {
      const old = (request.result as StoredObservation[]).map(observation);
      points = compactAllocationHistory([...old, ...incoming], Date.now());
      const byTime = new Map(old.map(point => [point.timestamp, point]));
      const retained = new Set(points.map(point => point.timestamp));
      for (const point of old) if (!retained.has(point.timestamp)) store.delete([owner, point.timestamp]);
      for (const point of points) if (JSON.stringify(point) !== JSON.stringify(byTime.get(point.timestamp))) store.put({ ...point, wallet: owner });
    };
    tx.oncomplete = () => resolve(points);tx.onerror = () => reject(tx.error);tx.onabort = () => reject(tx.error);
  });
}
