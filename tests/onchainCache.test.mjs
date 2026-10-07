import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const loadTs = createTsLoader({ 'server-only': {}, '@/lib/cache/upstash': { redis: null } });
const { OnchainWalletCache, buildOnchainCacheKey } = loadTs('lib/onchain/cache.ts');
const { ONCHAIN_FRESH_MS, ONCHAIN_SERVER_RETENTION_MS } = loadTs('lib/onchain/cachePolicy.ts');
const wallet = { id: 'wallet', name: 'Wallet', address: '0xAbC', chains: ['ethereum'] };
const good = (value = 100) => ({ walletId: wallet.id, walletName: wallet.name, address: wallet.address,
  chains: wallet.chains, balances: [], totalUsdValue: value, defiPositions: [], dataQuality: { complete: true, errors: [] } });

function fixture() {
  let now = 1000000;
  const entries = new Map();
  const locks = new Map();
  const jobs = [];
  const writes = [];
  const store = {
    read: async (key) => entries.get(key) ?? null,
    write: async (key, entry, ttl) => { entries.set(key, entry); writes.push(ttl); },
    acquire: async (key, token) => { if (locks.has(key)) return false; locks.set(key, token); return true; },
    release: async (key, token) => { if (locks.get(key) === token) locks.delete(key); },
  };
  return { cache: new OnchainWalletCache(store, () => now), store, jobs, entries, writes, locks,
    advance: (ms) => { now += ms; }, schedule: (job) => jobs.push(job) };
}

test('fresh wallet cache avoids upstream calls and keeps its original data time', async () => {
  const f = fixture();
  const first = await f.cache.get('key', wallet, async () => good(), f.schedule);
  f.advance(60000);
  const second = await f.cache.get('key', { ...wallet, name: 'Renamed' }, async () => assert.fail('cache miss'), f.schedule);
  assert.equal(second.dataUpdatedAt, first.dataUpdatedAt);
  assert.equal(second.walletName, 'Renamed');
  assert.equal(second.cache.source, 'server');
  assert.equal(f.jobs.length, 0);
  assert.equal(f.writes[0], ONCHAIN_SERVER_RETENTION_MS / 1000);
});

test('concurrent cold requests fetch once and return the shared complete result', async () => {
  const f = fixture();
  let complete;
  let calls = 0;
  const pending = new Promise((resolve) => { complete = resolve; });
  const load = async () => { calls++; return pending; };
  const first = f.cache.get('key', wallet, load, f.schedule);
  const second = f.cache.get('key', { ...wallet, name: 'Other label' }, load, f.schedule);
  await new Promise((resolve) => setImmediate(resolve));
  complete(good(123));
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a.totalUsdValue, 123);
  assert.equal(b.totalUsdValue, 123);
  assert.equal(b.walletName, 'Other label');
  assert.equal(a.dataUpdatedAt, b.dataUpdatedAt);
  assert.equal(f.locks.size, 0);
});

test('stale requests return immediately and schedule only one complete-wallet update', async () => {
  const f = fixture();
  await f.cache.get('key', wallet, async () => good(), f.schedule);
  f.advance(ONCHAIN_FRESH_MS + 1);
  let calls = 0;
  const fetch = async () => { calls++; return good(200); };
  const stale = await f.cache.get('key', wallet, fetch, f.schedule);
  const duplicate = await f.cache.get('key', wallet, fetch, f.schedule);
  assert.equal(stale.totalUsdValue, 100);
  assert.equal(duplicate.cache.refreshing, true);
  assert.equal(calls, 0);
  assert.equal(f.jobs.length, 1);
  await f.jobs[0]();
  const updated = await f.cache.get('key', wallet, fetch, f.schedule);
  assert.equal(updated.totalUsdValue, 200);
  assert.equal(calls, 1);
});

test('another server instance shares the refresh lock', async () => {
  const f = fixture();
  await f.cache.get('key', wallet, async () => good(), f.schedule);
  f.advance(ONCHAIN_FRESH_MS + 1);
  const other = new OnchainWalletCache(f.store, () => 1000000 + ONCHAIN_FRESH_MS + 1);
  await f.cache.get('key', wallet, async () => good(200), f.schedule);
  await other.get('key', wallet, async () => assert.fail('duplicate upstream'), f.schedule);
  assert.equal(f.jobs.length, 1);
  await f.jobs[0]();
});

test('failed and incomplete updates preserve previous assets and time without extending retention', async () => {
  const f = fixture();
  const initial = await f.cache.get('key', wallet, async () => good(100), f.schedule);
  f.advance(ONCHAIN_FRESH_MS + 1);
  const result = await f.cache.get('key', wallet, async () => ({ ...good(0), dataQuality: { complete: false, errors: ['DeFi failed'] } }), f.schedule, true);
  assert.equal(result.totalUsdValue, 100);
  assert.equal(result.dataUpdatedAt, initial.dataUpdatedAt);
  assert.match(result.cache.refreshError, /DeFi failed/);
  assert.ok(f.writes.at(-1) < f.writes[0]);
  await f.cache.get('key', wallet, async () => assert.fail('retry backoff'), f.schedule);
  assert.equal(f.jobs.length, 0);
});

test('force refresh bypasses freshness and a genuine zero balance replaces the cache', async () => {
  const f = fixture();
  await f.cache.get('key', wallet, async () => good(100), f.schedule);
  f.advance(1);
  const result = await f.cache.get('key', wallet, async () => good(0), f.schedule, true);
  assert.equal(result.totalUsdValue, 0);
  assert.equal(result.cache.source, 'live');
});

test('expired entries are not returned as valid cache after seven days', async () => {
  const f = fixture();
  await f.cache.get('key', wallet, async () => good(100), f.schedule);
  f.advance(ONCHAIN_SERVER_RETENTION_MS + 1);
  const result = await f.cache.get('key', wallet, async () => good(300), f.schedule);
  assert.equal(result.totalUsdValue, 300);
});

test('cache identities normalize EVM case and chain order but isolate filters and credentials', () => {
  const creds = { apiKey: 'private-key', apiSecret: 'private-secret', passphrase: 'private-passphrase', projectId: 'project' };
  const a = buildOnchainCacheKey({ ...wallet, chains: ['base', 'ethereum'] }, [], creds);
  const b = buildOnchainCacheKey({ ...wallet, address: '0xabc', chains: ['ethereum', 'base'] }, [], creds);
  assert.equal(a, b);
  assert.notEqual(a, buildOnchainCacheKey({ ...wallet, chains: ['base', 'ethereum'] }, [{ chainId: '1', tokenAddress: '0xReceipt' }], creds));
  assert.notEqual(a, buildOnchainCacheKey({ ...wallet, chains: ['base', 'ethereum'] }, [], { ...creds, apiSecret: 'other' }));
  assert.ok(!a.includes('private'));
  const sol = { ...wallet, chains: ['solana'], address: 'AbC' };
  assert.notEqual(buildOnchainCacheKey(sol, [], creds), buildOnchainCacheKey({ ...sol, address: 'abc' }, [], creds));
});
