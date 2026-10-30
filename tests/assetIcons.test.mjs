import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createTsLoader } from './helpers/loadTs.mjs';

const params = (symbol) => ({ params: Promise.resolve({ symbol }) });
const request = new Request('http://localhost/api/token-logo/BTC');
const route = (fetchWithTimeout, bundled = false) => createTsLoader({
  '@/lib/http/fetch': { fetchWithTimeout },
  '@/lib/prices': { SYMBOL_TO_COINGECKO: { BTC: 'bitcoin', USDT: 'tether', BNB: 'binancecoin' } },
  ...(!bundled ? { '@/lib/portfolio/tokenIcons': { bundledTokenIconUrl: () => null } } : {}),
})('app/api/token-logo/[symbol]/route.ts');

test('all bundled logos remain available when the metadata API is rate limited', async () => {
  const { BUNDLED_TOKEN_ICONS, bundledTokenIconUrl } = createTsLoader()('lib/portfolio/tokenIcons.ts');
  const calls = [];
  const { GET } = route(async url => { calls.push(String(url)); return new Response(null, { status: 429 }); }, true);
  for (const symbol of Object.keys(BUNDLED_TOKEN_ICONS)) {
    const response = await GET(request, params(symbol));
    assert.equal(response.status, 307, symbol);
    const path = new URL(response.headers.get('Location'), request.url).pathname;
    assert.equal(path, bundledTokenIconUrl(symbol));
    const file = new URL(`../public${path}`, import.meta.url);
    assert.ok(existsSync(file), symbol);
    assert.ok(readFileSync(file).length > 100, symbol);
  }
  assert.equal(bundledTokenIconUrl('ldtrx'), bundledTokenIconUrl('TRX'));
  assert.equal(bundledTokenIconUrl('PENDLE(Ethereum)'), bundledTokenIconUrl('PENDLE'));
  assert.equal(bundledTokenIconUrl('ldusdg'), bundledTokenIconUrl('USDG'));
  assert.equal(bundledTokenIconUrl('USDG(Ethereum)'), bundledTokenIconUrl('USDG'));
  assert.equal(bundledTokenIconUrl('pons(Robinhood)'), bundledTokenIconUrl('PONS'));
  for (const symbol of ['UNKNOWN', '__proto__', 'constructor']) assert.equal(bundledTokenIconUrl(symbol), null);
  assert.deepEqual(calls, []);
});

test('token logos reuse known coin IDs and cache both metadata and image responses', async () => {
  const calls = [];
  const { GET } = route(async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? Response.json({ image: { small: 'https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png' } })
      : new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
  });
  const response = await GET(request, params('BTC(Ethereum)'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.match(response.headers.get('Cache-Control'), /s-maxage=2592000/);
  assert.match(calls[0].url, /\/coins\/bitcoin\?/);
  assert.ok(calls.every(call => call.options.next.revalidate === 2592000));
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [137, 80, 78, 71]);
});

test('unrecognized tokens do not trigger searches and untrusted image hosts are never fetched', async () => {
  const calls = [];
  const { GET } = route(async (url) => {
    calls.push(String(url));
    return Response.json({ image: { small: 'http://127.0.0.1/private' } });
  });
  for (const symbol of ['UNKNOWN', '__proto__']) assert.equal((await GET(request, params(symbol))).status, 404);
  assert.equal(calls.length, 0);
  assert.equal((await GET(request, params('LDUSDT'))).status, 404);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/coins\/tether\?/);
});

test('common exchange assets and earn receipts resolve to exact coin IDs with high-resolution images', async () => {
  for (const [symbol, id] of [['BNB', 'binancecoin'], ['ENA', 'ethena'], ['LDENA', 'ethena'], ['SUI', 'sui'], ['USDE', 'ethena-usde'], ['USDG', 'global-dollar'], ['LDUSDG', 'global-dollar'], ['PONS', 'pons']]) {
    const calls = [];
    const { GET } = route(async url => {
      calls.push(String(url));
      return calls.length === 1
        ? Response.json({ image: { small: 'https://coin-images.coingecko.com/small.png', large: 'https://coin-images.coingecko.com/large.png' } })
        : new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } });
    });
    const response = await GET(new Request(`http://localhost/api/token-logo/${symbol}?size=large`), params(symbol));
    assert.equal(response.status, 200, symbol);
    assert.ok(calls[0].includes(`/coins/${id}?`), symbol);
    assert.equal(calls[1], 'https://coin-images.coingecko.com/large.png');
  }
});

test('temporary icon failures are never cached as permanently missing images', async () => {
  for (const status of [429, 500, 503]) {
    const { GET } = route(async () => new Response(null, { status }));
    const response = await GET(request, params('BNB'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.ok(Number(response.headers.get('Retry-After')) > 0);
  }
});

test('an unavailable icon provider returns an uncached temporary failure for the UI fallback', async () => {
  const { GET } = route(async () => { throw new Error('timeout'); });
  const response = await GET(request, params('BTC'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('classification preserves source logos and option underlying icons without changing values or labels', () => {
  const { buildClassificationAssets, aggregateAssetCategories, DEFAULT_ASSET_CATEGORIES } = createTsLoader()('lib/portfolio/assetCategories.ts');
  const assets = buildClassificationAssets({
    banks: [], customAssets: [],
    okx: { configured: true, totalUsdValue: 100, balances: [{ asset: 'ETH', amount: 1, usdValue: 100, logo: 'https://example.test/eth.png' }] },
    stocks: { brokers: [{ broker: 'ibkr', totalUsdValue: 50, cash: [], positions: [
      { id: 'put', symbol: 'NVDA261218P00180000', name: 'NVDA 18DEC26 180 P', market: 'US', kind: 'option', marketValueUsd: -50 },
      { id: 'a-share', symbol: '600519', name: '贵州茅台', market: 'A', marketValueUsd: 100 },
    ] }] },
  });
  const buckets = aggregateAssetCategories(assets, { categories: DEFAULT_ASSET_CATEGORIES, assignments: {}, redirects: {}, defaultCategoryId: 'cash' });
  const details = buckets.flatMap(bucket => bucket.details);
  assert.deepEqual(details.find(row => row.label === 'ETH · OKX').icon, { symbol: 'ETH', src: 'https://example.test/eth.png', market: undefined });
  assert.deepEqual(details.find(row => row.value === -50).icon, { symbol: 'NVDA', market: 'US' });
  assert.deepEqual(details.find(row => row.label === '600519 · 贵州茅台 · IBKR').icon, { symbol: '600519', market: 'A' });
  assert.equal(buckets.reduce((total, bucket) => total + bucket.value, 0), 150);
});
