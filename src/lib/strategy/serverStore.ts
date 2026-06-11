import 'server-only';
import { redis } from '@/lib/cache/upstash';
import type { StrategyTable } from '@/stores/strategyStore';

// Storage model: a Redis hash where the field is the user-supplied `key`
// ("记号") and the value is the latest table for that key. Re-POSTing the
// same key overwrites — there's only ever one entry per key, so the AI side
// can keep pushing updates without bloating storage.
//
// Old layout was a LPUSH list at `strategy:tables`; we use a fresh key so
// the type change (list → hash) doesn't trip WRONGTYPE on legacy data.
const TABLES_HASH_KEY = 'strategy:tables_map';
// INCR'd on every mutation; SSE polls this to detect changes without
// re-fetching the whole hash each tick.
const VERSION_KEY = 'strategy:version';

export type ServerStrategyTable = StrategyTable;

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function isStrategyConfigured(): boolean {
  return redis !== null;
}

export async function listTables(): Promise<ServerStrategyTable[]> {
  if (!redis) return [];
  // @upstash/redis auto-deserializes JSON payloads.
  const values = (await redis.hvals(TABLES_HASH_KEY)) as unknown[];
  const out: ServerStrategyTable[] = [];
  for (const item of values) {
    if (item && typeof item === 'object') {
      out.push(item as ServerStrategyTable);
    } else if (typeof item === 'string') {
      try {
        out.push(JSON.parse(item) as ServerStrategyTable);
      } catch {
        // Skip malformed entries silently.
      }
    }
  }
  // Newest first — the SSE/client side expects this order so freshly-pushed
  // tables surface at the top.
  out.sort((a, b) => b.importedAt - a.importedAt);
  return out;
}

export async function getVersion(): Promise<number> {
  if (!redis) return 0;
  const v = await redis.get<number>(VERSION_KEY);
  return v ?? 0;
}

export interface UpsertInput {
  key: string;
  headers: string[];
  rows: string[][];
  raw: string;
  note?: string;
  importedAt?: number;
}

export async function upsertTable(
  input: UpsertInput
): Promise<ServerStrategyTable> {
  if (!redis) throw new Error('Redis not configured');
  const table: ServerStrategyTable = {
    id: makeId(),
    key: input.key,
    importedAt: input.importedAt ?? Date.now(),
    headers: input.headers,
    rows: input.rows,
    raw: input.raw,
    note: input.note,
  };
  await redis.hset(TABLES_HASH_KEY, { [input.key]: table });
  await redis.incr(VERSION_KEY);
  return table;
}

// Removes one entry by key. Returns the number of fields actually removed
// (0 if the key didn't exist) so the caller can 404 if it cares.
export async function deleteTable(key: string): Promise<number> {
  if (!redis) throw new Error('Redis not configured');
  const removed = await redis.hdel(TABLES_HASH_KEY, key);
  if (removed > 0) await redis.incr(VERSION_KEY);
  return removed;
}

// Wipes every keyed entry. Used by the dashboard's "清空全部" button when
// the user wants to start fresh across all keys at once.
export async function deleteAllTables(): Promise<void> {
  if (!redis) throw new Error('Redis not configured');
  await redis.del(TABLES_HASH_KEY);
  await redis.incr(VERSION_KEY);
}
