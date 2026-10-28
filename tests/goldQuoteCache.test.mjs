import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

async function withProvider(run) {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let now = 1_790_000_000_000, calls = 0, failing = false;
  Date.now = () => now;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://hq.sinajs.cn/list=SGE_AU9999');
    assert.equal(options.next.revalidate, 30);
    assert.equal(options.headers.Referer, 'https://finance.sina.com.cn/');
    await Promise.resolve();
    if (failing) throw new Error('network offline');
    const stamp = new Date(now + 8 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
    return new Response(`var hq_str_SGE_AU9999="AU9999,Gold,Au99.99,700,695,690,692,710,680,691,698,701,100,200,1000,700000,${stamp},1.45%";`);
  };
  const load = createTsLoader({ 'server-only': {} });
  try { await run({ load, calls: () => calls, advance: ms => { now += ms; }, fail: () => { failing = true; } }); }
  finally { global.fetch = originalFetch; Date.now = originalNow; }
}

test('concurrent and repeated gold requests reuse one upstream quote for thirty seconds', () => withProvider(async ({ load, calls, advance }) => {
  const { fetchGoldQuote } = load('lib/gold/server.ts');
  const result = await Promise.all(Array.from({ length: 40 }, () => fetchGoldQuote()));
  assert.equal(calls(), 1);
  assert.ok(result.every(q => q.price === 700 && q.status === 'live'));
  await fetchGoldQuote();
  assert.equal(calls(), 1);
  advance(30_001);
  await fetchGoldQuote();
  assert.equal(calls(), 2);
}));

test('outage keeps the actual quote timestamp, labels the fallback, and uses a retry cooldown', () => withProvider(async ({ load, calls, advance, fail }) => {
  const { fetchGoldQuote } = load('lib/gold/server.ts');
  const first = await fetchGoldQuote();
  advance(30_001); fail();
  const cached = await fetchGoldQuote();
  assert.equal(cached.status, 'stale');
  assert.ok(cached.error);
  assert.equal(cached.updatedAt, first.updatedAt);
  assert.equal(cached.receivedAt, first.receivedAt);
  await fetchGoldQuote();
  assert.equal(calls(), 2);
  advance(15 * 24 * 60 * 60 * 1000);
  await assert.rejects(fetchGoldQuote(), /network offline/);
  await assert.rejects(fetchGoldQuote(), /network offline/);
  assert.equal(calls(), 3);
}));

test('an unavailable provider has negative caching instead of retrying on every request', () => withProvider(async ({ load, calls, advance, fail }) => {
  fail();
  const { fetchGoldQuote } = load('lib/gold/server.ts');
  await assert.rejects(fetchGoldQuote());
  await assert.rejects(fetchGoldQuote());
  assert.equal(calls(), 1);
  advance(30_001);
  await assert.rejects(fetchGoldQuote());
  assert.equal(calls(), 2);
}));

test('gold API uses public cache headers for success and no-store for failures', async () => {
  let failing = false;
  const load = createTsLoader({
    '@/lib/http/guards': { enforceRateLimit: async () => null },
    '@/lib/gold/server': { fetchGoldQuote: async () => { if (failing) throw new Error('private upstream failure'); return { price: 3100 }; } },
  });
  const { GET } = load('app/api/gold/route.ts');
  const good = await GET(new Request('http://localhost/api/gold'));
  assert.equal(good.status, 200);
  assert.match(good.headers.get('Cache-Control'), /s-maxage=30/);
  failing = true;
  const bad = await GET(new Request('http://localhost/api/gold'));
  assert.equal(bad.status, 503);
  assert.equal(bad.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(JSON.stringify(await bad.json()), /private upstream failure/);
});
