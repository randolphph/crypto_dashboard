import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
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
            : fundingBalances,
        };
        return Response.json(response);
      },
    },
  });
  return { ...client, requests };
}

test('OKX uses currency equity for amount and eqUsd for dollar valuation', async () => {
  const client = okxClient([{ ccy: 'BTC', eq: '0.05', eqUsd: '4250', availBal: '0.01', frozenBal: '0.01' }]);
  assert.deepEqual(await client.fetchOkxBalances('key', 'secret', 'passphrase'), [
    { asset: 'BTC', amount: 0.05, usdValue: 4250 },
  ]);
});

test('positive equity is retained when OKX available or frozen fields are empty', async () => {
  const client = okxClient([{ ccy: 'ETH', eq: '2', eqUsd: '5000', availBal: '', frozenBal: '' }]);
  assert.deepEqual(await client.fetchOkxBalances('key', 'secret', 'passphrase'), [
    { asset: 'ETH', amount: 2, usdValue: 5000 },
  ]);
});

test('funding-only holdings are fetched with the configured credentials', async () => {
  const client = okxClient([], [{ ccy: 'USDT', bal: '1200', availBal: '1000', frozenBal: '200' }]);
  assert.deepEqual(await client.fetchOkxBalances('key', 'secret', 'passphrase'), [
    { asset: 'USDT', amount: 1200, usdValue: 0 },
  ]);
  assert.deepEqual(client.requests.map((request) => request.endpoint).sort(), [
    '/api/v5/account/balance', '/api/v5/asset/balances',
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
    '@/lib/exchanges/okx': { fetchOkxBalances: async () => [
      { asset: 'BTC', amount: 0.00005, usdValue: 5 },
      { asset: 'BTC', amount: 0.0001, usdValue: 0 },
      { asset: 'USDT', amount: 1000, usdValue: 0 },
    ] },
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
