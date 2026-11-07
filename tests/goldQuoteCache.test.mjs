import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

async function withProvider(run) {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let now = 1_790_000_000_000, calls = 0, failing = false;
  Date.now = () => now;
  global.fetch = async (url, options) => {
    if (!url.includes('sinajs')) throw new Error('fallback offline');
    calls++;
    assert.equal(url, 'https://hq.sinajs.cn/list=SGE_AU9999');
    assert.equal(options.next.revalidate, 30);
    assert.equal(options.headers.Referer, 'https://finance.sina.com.cn/');
    await Promise.resolve();
    if (failing) throw new Error('network offline');
    const stamp = new Date(now + 8 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
    return new Response(`var hq_str_SGE_AU9999="AU9999,Gold,Au99.99,700,695,690,692,710,680,691,698,701,100,200,1000,700000,${stamp},1.45%";`);
  };
  const load = createTsLoader({ 'server-only': {}, '@/lib/cache/upstash': { redis: null } });
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
  await assert.rejects(fetchGoldQuote(), /黄金行情暂不可用/);
  await assert.rejects(fetchGoldQuote(), /黄金行情暂不可用/);
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

const weekend = Date.parse('2026-11-07T04:00:00Z');
const sina = stamp => `var hq_str_SGE_AU9999="AU9999,Gold,Au99.99,700,695,690,692,710,680,691,698,701,100,200,1000,700000,${stamp},1.45%";`;
const dailyHtml = (date = '2026-11-06', price = '695') => `<table class="daily_new_table"><thead><tr><th>日期</th><th>合约</th><th>开盘价</th><th>最高价</th><th>最低价</th><th>收盘价</th></tr></thead><tbody><tr><!-- <td>1</td> --><td>${date}</td><td>Au99.99</td><td>680</td><td>710</td><td>675</td><td>${price}</td></tr><tr><td>${date}</td><td>Au(T+D)</td><td>1</td><td>1</td><td>1</td><td>9999</td></tr></tbody></table>`;

test('a cold weekend request recovers from Sina future timestamps using the official domestic close', async () => {
  const originalFetch = global.fetch, originalNow = Date.now;
  Date.now = () => weekend;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return new Response(url.includes('sinajs') ? sina('2026-11-08 20:00:00') : dailyHtml());
  };
  try {
    const { fetchGoldQuote } = createTsLoader({ 'server-only': {}, '@/lib/cache/upstash': { redis: null } })('lib/gold/server.ts');
    const quote = await fetchGoldQuote();
    assert.equal(quote.price, 695);
    assert.equal(quote.source, 'sge-daily');
    assert.equal(quote.status, 'stale');
    assert.equal(quote.updatedAt, '2026-11-06T07:30:00.000Z');
    const { valueGoldHoldings } = createTsLoader()('lib/portfolio/gold.ts');
    const valuation = valueGoldHoldings([{ id: 'qa', name: 'Gold', grams: 10, buyPricePerGram: 600, currency: 'CNY' }], { cnyUsd: .14, hkdUsd: .128, krwUsd: .0007 }, quote, weekend);
    const { assessHistoryRecording } = createTsLoader()('lib/portfolio/history.ts');
    const recording = assessHistoryRecording({ totalValue: valuation.totalUsd, sources: [{ label: '黄金', required: true, value: valuation.totalUsd, warnings: ['使用国内最近成交价，请留意行情时间'] }] });
    assert.equal(recording.canRecord, true);
    assert.equal(recording.status, 'estimated');
    await fetchGoldQuote();
    assert.equal(calls.length, 2, 'both sources share the refresh cooldown');
  } finally { global.fetch = originalFetch; Date.now = originalNow; }
});

test('official close parsing rejects future, expired, wrong-contract and invalid daily prices', () => {
  const { parseSgeDailyQuote } = createTsLoader()('lib/gold/quote.ts');
  assert.equal(parseSgeDailyQuote(dailyHtml(), weekend).price, 695);
  for (const html of [dailyHtml('2026-11-08'), dailyHtml('2026-10-01'), dailyHtml('2026-02-30'), dailyHtml('2026-11-06', '-'), dailyHtml().replace('Au99.99', 'iAu99.99'), '<html>Access denied</html>']) {
    assert.throws(() => parseSgeDailyQuote(html, weekend));
  }
});

test('a new service instance restores the last valid gold quote when both providers fail', async () => {
  const originalFetch = global.fetch, originalNow = Date.now;
  let now = weekend, saved;
  Date.now = () => now;
  const redis = { get: async () => saved, set: async (_key, value) => { saved = structuredClone(value); } };
  const mocks = { 'server-only': {}, '@/lib/cache/upstash': { redis } };
  global.fetch = async () => new Response(sina('2026-11-07 12:00:00'));
  try {
    const first = await createTsLoader(mocks)('lib/gold/server.ts').fetchGoldQuote();
    assert.ok(saved, 'quote persisted outside process memory');
    now += 31_000;
    global.fetch = async () => { throw new Error('network offline'); };
    const restored = await createTsLoader(mocks)('lib/gold/server.ts').fetchGoldQuote();
    assert.equal(restored.price, first.price);
    assert.equal(restored.updatedAt, first.updatedAt);
    assert.equal(restored.status, 'stale');
    now += 15 * 86400000;
    await assert.rejects(createTsLoader(mocks)('lib/gold/server.ts').fetchGoldQuote());
  } finally { global.fetch = originalFetch; Date.now = originalNow; }
});

test('known provider failures expose safe rate-limit diagnostics, without claiming other errors are throttling', async () => {
  const originalFetch = global.fetch;
  let status = 429;
  global.fetch = async () => new Response('private upstream body', { status });
  const mocks = { 'server-only': {}, '@/lib/cache/upstash': { redis: null }, '@/lib/http/guards': { enforceRateLimit: async () => null } };
  try {
    const response = await createTsLoader(mocks)('app/api/gold/route.ts').GET(new Request('http://localhost/api/gold'));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.match(body.error, /HTTP 429/);
    assert.deepEqual(body.sources.map(s => s.status), [429, 429]);
    assert.doesNotMatch(JSON.stringify(body), /private upstream body/);
    status = 403;
    const denied = await createTsLoader(mocks)('app/api/gold/route.ts').GET(new Request('http://localhost/api/gold'));
    const deniedBody = await denied.json();
    assert.doesNotMatch(deniedBody.error, /限流/);
    assert.deepEqual(deniedBody.sources.map(s => s.status), [403, 403]);
  } finally { global.fetch = originalFetch; }
});

test('a recent persisted trade wins over an older official close and unchanged closes are not rewritten', async () => {
  const originalFetch = global.fetch, originalNow = Date.now;
  let now = weekend, saved, writes = 0;
  Date.now = () => now;
  const redis = { get: async () => saved, set: async (_key, value) => { writes++; saved = structuredClone(value); } };
  global.fetch = async url => new Response(url.includes('sinajs') ? sina('2026-11-08 20:00:00') : dailyHtml());
  try {
    const load = () => createTsLoader({ 'server-only': {}, '@/lib/cache/upstash': { redis } })('lib/gold/server.ts');
    const service = load();
    await service.fetchGoldQuote();
    assert.equal(writes, 1);
    now += 31_000;
    await service.fetchGoldQuote();
    assert.equal(writes, 1, 'same daily close does not spend another cache write');
    saved = { ...saved, source: 'sina-sge', price: 702, updatedAt: new Date(weekend - 3600000).toISOString() };
    const preferred = await load().fetchGoldQuote();
    assert.equal(preferred.price, 702);
    assert.equal(preferred.source, 'sina-sge');
    assert.equal(preferred.status, 'stale');
  } finally { global.fetch = originalFetch; Date.now = originalNow; }
});

test('Redis failures and malformed persisted quotes cannot block valid official closes', async () => {
  const originalFetch = global.fetch, originalNow = Date.now;
  Date.now = () => weekend;
  global.fetch = async url => new Response(url.includes('sinajs') ? sina('2026-11-08 20:00:00') : dailyHtml());
  try {
    for (const redis of [
      { get: async () => { throw new Error('private cache failure'); }, set: async () => { throw new Error('cache write offline'); } },
      { get: async () => ({ price: 9999, source: 'international' }), set: async () => undefined },
    ]) {
      const quote = await createTsLoader({ 'server-only': {}, '@/lib/cache/upstash': { redis } })('lib/gold/server.ts').fetchGoldQuote();
      assert.equal(quote.price, 695);
      assert.equal(quote.source, 'sge-daily');
    }
  } finally { global.fetch = originalFetch; Date.now = originalNow; }
});
