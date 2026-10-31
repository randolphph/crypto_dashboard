import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import crypto from 'node:crypto';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
function loadTs(relative, mocks) {
  const filename = path.join(sourceRoot, relative);
  const loaded = new Module(filename);
  loaded.require = (specifier) => Object.hasOwn(mocks, specifier)
    ? mocks[specifier]
    : Module.createRequire(filename)(specifier);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}

function okxClient(tradingDetails, fundingBalances = [], overrides = {}) {
  const requests = [];
  const client = loadTs('lib/exchanges/okx.ts', {
    'server-only': {},
    '@/lib/http/fetch': {
      fetchWithTimeout: async (url, options) => {
        const endpoint = new URL(url).pathname;
        requests.push({ endpoint, options });
        const response = overrides[endpoint] ?? {
          code: '0',
          data: endpoint === '/api/v5/account/balance'
            ? [{ details: tradingDetails }]
            : endpoint === '/api/v5/asset/balances' ? fundingBalances : [],
        };
        if (response instanceof Error) throw response;
        return Response.json(response);
      },
    },
  });
  return { ...client, requests };
}

test('OKX uses currency equity for amount and eqUsd for dollar valuation', async () => {
  const client = okxClient([{ ccy: 'BTC', eq: '0.05', eqUsd: '4250', availBal: '0.01', frozenBal: '0.01' }]);
  assert.deepEqual((await client.fetchOkxBalances('key', 'secret', 'passphrase')).balances, [
    { asset: 'BTC', amount: 0.05, usdValue: 4250 },
  ]);
});

test('positive equity is retained when OKX available or frozen fields are empty', async () => {
  const client = okxClient([{ ccy: 'ETH', eq: '2', eqUsd: '5000', availBal: '', frozenBal: '' }]);
  assert.deepEqual((await client.fetchOkxBalances('key', 'secret', 'passphrase')).balances, [
    { asset: 'ETH', amount: 2, usdValue: 5000 },
  ]);
});

test('funding-only holdings are fetched with the configured credentials', async () => {
  const client = okxClient([], [{ ccy: 'USDT', bal: '1200', availBal: '1000', frozenBal: '200' }]);
  assert.deepEqual((await client.fetchOkxBalances('key', 'secret', 'passphrase')).balances, [
    { asset: 'USDT', amount: 1200, usdValue: 0 },
  ]);
  assert.deepEqual(client.requests.map((request) => request.endpoint).sort(), [
    '/api/v5/account/balance', '/api/v5/asset/balances', '/api/v5/finance/savings/balance',
  ]);
  for (const request of client.requests) {
    assert.equal(request.options.headers['OK-ACCESS-KEY'], 'key');
    assert.equal(request.options.headers['OK-ACCESS-PASSPHRASE'], 'passphrase');
  }
});

test('funding API errors are surfaced rather than reported as zero assets', async () => {
  const client = okxClient([], [], { '/api/v5/asset/balances': { code: '50105', msg: 'Invalid passphrase', data: [] } });
  await assert.rejects(client.fetchOkxBalances('key', 'secret', 'passphrase'), /50105.*Invalid passphrase/);
});

test('USDG funding balances have a dollar price without an external ticker request', async () => {
  const { fetchPrices } = loadTs('lib/prices.ts', {
    'server-only': {},
    '@/lib/http/fetch': { fetchWithTimeout: async () => assert.fail('USDG should use stablecoin pricing') },
  });
  assert.deepEqual(await fetchPrices(['USDG']), { USDG: 1 });
});

test('OKX route prices funding balances and combines currencies before the $10 filter', async () => {
  const { GET } = loadTs('app/api/exchanges/okx/route.ts', {
    '@/lib/exchanges/okx': { fetchOkxBalances: async () => ({ balances: [
      { asset: 'BTC', amount: 0.00005, usdValue: 5 },
      { asset: 'BTC', amount: 0.0001, usdValue: 0 },
      { asset: 'USDT', amount: 1000, usdValue: 0 },
    ], errors: [] }) },
    '@/lib/prices': { fetchPrices: async () => ({ BTC: 100000, USDT: 1 }) },
    '@/lib/http/guards': { enforceRateLimit: async () => null },
  });
  const response = await GET(new Request('http://localhost/api/exchanges/okx', {
    headers: { 'x-okx-api-key': 'key', 'x-okx-api-secret': 'secret', 'x-okx-passphrase': 'passphrase' },
  }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.totalUsdValue, 1015);
  assert.equal(data.balances.length, 2);
  assert.equal(data.balances[0].asset, 'BTC');
  assert.equal(data.balances[0].usdValue, 15);
  assert.equal(data.balances[0].amount, 0.00005 + 0.0001);
  assert.equal(data.dataQuality.complete, true);
});

const savingsPath = '/api/v5/finance/savings/balance';

test('Earn-only holdings use total amt without adding earnings, lent or pending amounts again', async () => {
  const client = okxClient([], [], { [savingsPath]: { code: '0', data: [
    { ccy: 'USDT', amt: '1100.25', earnings: '100.25', loanAmt: '1000', pendingAmt: '100.25' },
    { ccy: 'BTC', amt: '0.01', earnings: '0.001', loanAmt: '0.005', pendingAmt: '0.005' },
    { ccy: 'ETH', amt: '0' },
  ] } });
  const result = await client.fetchOkxBalances('key', 'secret', 'passphrase');
  assert.deepEqual(result, { balances: [
    { asset: 'USDT', amount: 1100.25, usdValue: 0 },
    { asset: 'BTC', amount: 0.01, usdValue: 0 },
  ], errors: [] });
  const { options } = client.requests.find(({ endpoint }) => endpoint === savingsPath);
  const timestamp = options.headers['OK-ACCESS-TIMESTAMP'];
  assert.equal(options.headers['OK-ACCESS-SIGN'], crypto.createHmac('sha256', 'secret')
    .update(timestamp + 'GET' + savingsPath).digest('base64'));
});

test('empty savings is complete; failed or malformed savings preserves other balances with an error', async () => {
  const trading = [{ ccy: 'BTC', eq: '0.1', eqUsd: '10000' }];
  const funding = [{ ccy: 'USDT', bal: '100' }];
  const valid = await okxClient(trading, funding).fetchOkxBalances('key', 'secret', 'passphrase');
  assert.deepEqual(valid.errors, []);
  for (const response of [
    { code: '50120', msg: 'Permission denied', data: [] },
    { code: '50011', msg: 'Rate limit reached', data: [] },
    new Error('Network timeout'),
    { code: '0', data: null },
    { code: '0', data: [{ ccy: 'USDT', amt: 'invalid' }] },
    { code: '0', data: [{ ccy: '', amt: '100' }] },
    { code: '0', data: [{ ccy: 'USDT', amt: '' }] },
  ]) {
    const result = await okxClient(trading, funding, { [savingsPath]: response })
      .fetchOkxBalances('key', 'secret', 'passphrase');
    assert.deepEqual(result.balances, valid.balances);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /赚币/);
  }
});

test('route includes Earn in totals and classification once, sharing prices across account rows', async () => {
  const { createTsLoader } = await import('./helpers/loadTs.mjs');
  const load = createTsLoader();
  const { buildClassificationAssets, aggregateAssetCategories, DEFAULT_ASSET_CATEGORIES } = load('lib/portfolio/assetCategories.ts');
  const client = okxClient([{ ccy: 'BTC', eq: '0.1', eqUsd: '10000' }], [
    { ccy: 'USDT', bal: '100' }, { ccy: 'BTC', bal: '0.001' },
  ], { [savingsPath]: { code: '0', data: [
    { ccy: 'USDT', amt: '1000' }, { ccy: 'BTC', amt: '0.01' },
  ] } });
  const priceCalls = [];
  const { GET } = loadTs('app/api/exchanges/okx/route.ts', {
    '@/lib/exchanges/okx': client,
    '@/lib/prices': { fetchPrices: async (symbols) => { priceCalls.push(symbols); return { USDT: 1, BTC: 100000 }; } },
    '@/lib/http/guards': { enforceRateLimit: async () => null },
  });
  const response = await GET(okxRequest());
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.totalUsdValue, 12200);
  assert.equal(data.balances.length, 2);
  assert.equal(data.balances.find(b => b.asset === 'USDT').amount, 1100);
  assert.equal(data.balances.find(b => b.asset === 'BTC').usdValue, 11100);
  assert.deepEqual(priceCalls, [['USDT', 'BTC']]);
  assert.deepEqual(data.dataQuality, { complete: true, errors: [] });
  const buckets = aggregateAssetCategories(buildClassificationAssets({ okx: data, banks: [], customAssets: [] }), {
    categories: DEFAULT_ASSET_CATEGORIES, assignments: {}, redirects: {}, defaultCategoryId: 'cash',
  });
  assert.equal(buckets.find(b => b.id === 'cash').value, 1100);
  assert.equal(buckets.find(b => b.id === 'crypto').value, 11100);
  assert.equal(buckets.reduce((sum, b) => sum + b.value, 0), 12200);
});

function okxRequest() {
  return new Request('http://localhost/api/exchanges/okx', {
    headers: { 'x-okx-api-key': 'key', 'x-okx-api-secret': 'secret', 'x-okx-passphrase': 'passphrase' },
  });
}

test('route exposes savings failure and missing prices as incomplete without dropping known balances', async () => {
  const { GET } = loadTs('app/api/exchanges/okx/route.ts', {
    '@/lib/exchanges/okx': { fetchOkxBalances: async () => ({ balances: [
      { asset: 'USDT', amount: 100, usdValue: 100 },
      { asset: 'UNKNOWN', amount: 10, usdValue: 0 },
    ], errors: ['OKX 简单赚币活期：Permission denied'] }) },
    '@/lib/prices': { fetchPrices: async () => ({}) },
    '@/lib/http/guards': { enforceRateLimit: async () => null },
  });
  const response = await GET(okxRequest());
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.totalUsdValue, 100);
  assert.deepEqual(data.dataQuality, { complete: false, errors: [
    'OKX 简单赚币活期：Permission denied', 'Price unavailable: UNKNOWN',
  ] });
});
