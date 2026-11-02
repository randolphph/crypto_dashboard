import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const request = () => new Request('http://localhost/api/exchanges/binance', {
  headers: { 'x-binance-api-key': 'test-key', 'x-binance-api-secret': 'test-secret' },
});
function client(accounts, quotes = {}) {
  const requests = [], priceCalls = [];
  const load = createTsLoader({
    'server-only': {},
    '@/lib/exchanges/binance': { fetchBinanceAllBalances: async () => ({ accounts, futuresPositions: [], gridBots: [] }) },
    '@/lib/prices': { fetchPrices: async symbols => { priceCalls.push(symbols); return { USDT: 1, USDC: 1, FDUSD: 1, CHEAP: 0.01 }; } },
    '@/lib/http/guards': { enforceRateLimit: async () => null },
    '@/lib/http/fetch': { fetchWithTimeout: async (url, options) => {
      requests.push({ url: new URL(url), options });
      const symbol = new URL(url).searchParams.get('symbol');
      const quote = quotes[symbol];
      if (quote instanceof Error) throw quote;
      return quote instanceof Response ? quote.clone() : quote ? Response.json(quote) : new Response('', { status: 200 });
    } },
  });
  return { load, requests, priceCalls, GET: load('app/api/exchanges/binance/route.ts').GET };
}
const balance = (asset, amount) => ({ asset, amount, usdValue: 0 });

test('Binance EQ equities use stock quotes; priced holdings under $1 disappear without missing-price warnings', async () => {
  const c = client([{ label: '现货', balances: [balance('USDT', 50), balance('EQ_GOOGL', .001), balance('EQ_MSTR', .001)] }], {
    GOOGL: { symbol: 'GOOGL', bidPrice: '199', askPrice: '201' },
    MSTR: { symbol: 'MSTR', bidPrice: '299', askPrice: '301' },
  });
  const response = await c.GET(request()), data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.totalUsdValue, 50);
  assert.deepEqual(data.balances, [balance('USDT', 50)].map(b => ({ ...b, usdValue: 50 })));
  assert.deepEqual(data.dataQuality, { complete: true, errors: [] });
  assert.deepEqual(c.priceCalls, [['USDT']]);
  assert.equal(c.requests.length, 2);
  for (const { url, options } of c.requests) {
    assert.equal(url.pathname, '/sapi/v1/equity/market/quote');
    assert.equal(url.searchParams.has('signature'), false);
    assert.equal(options.headers['X-MBX-APIKEY'], 'test-key');
  }
});

test('Binance retains $1 and $1–$10 balances and tests total value rather than unit price', async () => {
  const c = client([{ label: '现货', balances: [balance('USDT', .99), balance('USDC', 1), balance('FDUSD', 5), balance('CHEAP', 200), balance('EQ_MSTR', .01)] }], {
    MSTR: { symbol: 'MSTR', bidPrice: '299', askPrice: '301' },
  });
  const data = await (await c.GET(request())).json();
  assert.deepEqual(data.balances.map(b => [b.asset, b.usdValue]), [['USDC', 1], ['FDUSD', 5], ['CHEAP', 2], ['EQ_MSTR', 3]]);
  assert.equal(data.totalUsdValue, 11);
  assert.equal(data.dataQuality.complete, true);
});

test('an unavailable stock quote remains an explicit warning instead of being misclassified as dust', async () => {
  const c = client([{ label: '现货', balances: [balance('USDT', 50), balance('EQ_GOOGL', 100)] }]);
  const data = await (await c.GET(request())).json();
  assert.equal(data.totalUsdValue, 50);
  assert.deepEqual(data.dataQuality, { complete: false, errors: ['Price unavailable: EQ_GOOGL'] });
  assert.deepEqual(data.accounts[0].balances.find(b => b.asset === 'EQ_GOOGL'), {
    asset: 'EQ_GOOGL', amount: 100, usdValue: 0, valuationIncomplete: true,
  });
  assert.deepEqual(data.balances, data.accounts[0].balances);
});

test('an account containing only unpriced tiny quantities stays available in details', async () => {
  const c = client([{ label: '现货', balances: [balance('EQ_MSTR', .00000001)] }]);
  const data = await (await c.GET(request())).json();
  assert.equal(data.accounts.length, 1);
  assert.deepEqual(data.balances, [{ asset: 'EQ_MSTR', amount: .00000001, usdValue: 0, valuationIncomplete: true }]);
  assert.equal(data.totalUsdValue, 0);
  assert.equal(data.dataQuality.complete, false);
});

test('small balances do not hide account collection errors', async () => {
  const c = client([{ label: 'U本位合约', balances: [balance('USDT', .01)], error: 'Account unavailable' }]);
  const data = await (await c.GET(request())).json();
  assert.equal(data.accounts.length, 1);
  assert.deepEqual(data.dataQuality, { complete: false, errors: ['U本位合约: Account unavailable'] });
});

test('stock quotes are requested once per unique held ticker and reused briefly', async () => {
  const c = client([], { GOOGL: { symbol: 'GOOGL', bidPrice: '199', askPrice: '201' } });
  const { fetchBinanceEquityPrices } = c.load('lib/exchanges/binanceEquity.ts');
  assert.deepEqual(await fetchBinanceEquityPrices(['EQ_GOOGL', 'EQ_GOOGL', 'USDT'], 'test-key'), { EQ_GOOGL: 200 });
  assert.deepEqual(await fetchBinanceEquityPrices(['EQ_GOOGL'], 'another-key'), { EQ_GOOGL: 200 });
  assert.equal(c.requests.length, 1);
});

test('expired equity quotes are refreshed and cannot mask a later quote failure', async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    const quote = { symbol: 'GOOGL', bidPrice: '199', askPrice: '201' };
    const c = client([], { GOOGL: quote });
    const { fetchBinanceEquityPrices } = c.load('lib/exchanges/binanceEquity.ts');
    assert.deepEqual(await fetchBinanceEquityPrices(['EQ_GOOGL'], 'test-key'), { EQ_GOOGL: 200 });
    now += 31_000;
    quote.bidPrice = '299'; quote.askPrice = '301';
    assert.deepEqual(await fetchBinanceEquityPrices(['EQ_GOOGL'], 'test-key'), { EQ_GOOGL: 300 });
    now += 31_000;
    quote.bidPrice = '0'; quote.askPrice = '0';
    assert.deepEqual(await fetchBinanceEquityPrices(['EQ_GOOGL'], 'test-key'), {});
    assert.equal(c.requests.length, 3);
  } finally { Date.now = realNow; }
});

test('empty, failed, mismatched or invalid equity quotes never become invented prices or cached successes', async () => {
  for (const response of [
    new Response('', { status: 200 }), new Response('', { status: 403 }), new Error('Timeout'),
    { symbol: 'OTHER', bidPrice: '100', askPrice: '102' },
    { symbol: 'GOOGL', bidPrice: '0', askPrice: '0' },
    { symbol: 'GOOGL', bidPrice: 'NaN', askPrice: '100' },
    { symbol: 'GOOGL', bidPrice: '102', askPrice: '100' },
  ]) {
    const c = client([], { GOOGL: response });
    const { fetchBinanceEquityPrices } = c.load('lib/exchanges/binanceEquity.ts');
    assert.deepEqual(await fetchBinanceEquityPrices(['EQ_GOOGL'], 'test-key'), {});
    assert.deepEqual(await fetchBinanceEquityPrices(['EQ_GOOGL'], 'test-key'), {});
    assert.equal(c.requests.length, 2, 'failures must be retried next refresh');
  }
});
