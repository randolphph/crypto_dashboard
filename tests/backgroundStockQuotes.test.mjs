import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const clock = '2026-10-16T02:00:00.000Z';
const clientId = '11111111-1111-4111-8111-111111111111';
function stockRoute({ brokerFails = false, empty = false } = {}) {
  const subscriptions = [];
  const position = { id: 'ib-stock', broker: 'ibkr', market: 'US', symbol: 'NVDA', shares: 10, costBasis: 80, apiPnl: 200, kind: 'stock' };
  const options = [1, 2].map(index => ({ ...position, id: `ib-option-${index}`, shares: index, multiplier: 100, kind: 'option', apiPnl: 10 }));
  const queried = [];
  const { POST } = createTsLoader({
    'server-only': {},
    '@/lib/stocks/backgroundQuotes': {
      syncStockSubscriptions: async (...args) => { subscriptions.push(args); return true; },
      stockSymbols: rows => rows.filter(row => row.kind !== 'option' && row.shares !== 0).map(({ market, symbol }) => ({ market, symbol })),
      fetchAShareQuotes: async symbols => { queried.push(['A', symbols]); return symbols.map(symbol => ({ symbol, market: 'A', currency: 'CNY', price: 100, priceSource: 'tencent', priceStatus: 'ok', priceUpdatedAt: clock })); },
      fetchUsQuotes: async symbols => { queried.push(['US', symbols]); return symbols.map(symbol => ({ symbol, market: 'US', currency: 'USD', price: 150, priceSource: 'yahoo', priceStatus: 'ok', priceUpdatedAt: clock })); },
      fetchHkQuotes: async () => [], fetchKrQuotes: async () => [],
    },
    '@/lib/longport/positions': { fetchLongportPositions: async () => [], fetchLongportCash: async () => [] },
    '@/lib/ibkr/flex': { fetchIbkrSnapshot: async () => {
      if (brokerFails) throw new Error('broker unavailable');
      return empty ? { positions: [], cash: [], quotes: [] } : {
        positions: [position, ...options], cash: [], quotes: [
          { positionId: position.id, market: 'US', symbol: 'NVDA', price: 100, currency: 'USD' },
          ...options.map((option, index) => ({ positionId: option.id, market: 'US', symbol: 'NVDA', price: 5 + index, currency: 'USD' })),
        ],
      };
    } },
    '@/lib/stocks/fx': { fetchFx: async () => ({ cnyUsd: 0.14, hkdUsd: 0.128, krwUsd: 0.0007 }) },
    '@/lib/http/guards': { enforceRateLimit: async () => null, readJsonBody: request => request.json(), inputErrorResponse: error => Response.json({ error: error.message }, { status: 400 }) },
    '@/lib/http/validation': { parseStocksBody: value => value },
  })('app/api/stocks/route.ts');
  const run = positions => POST(new Request('http://localhost/api/stocks', { method: 'POST', headers: { 'content-type': 'application/json', 'x-stock-client-id': clientId, 'x-ibkr-flex-token': 'dummy-flex', 'x-ibkr-flex-query-id': 'dummy-query' }, body: JSON.stringify({ positions, cash: [] }) }));
  return { run, subscriptions, queried };
}

test('holding quotes retain the real market clock and revalue stocks without assigning underlying prices to option contracts', async () => {
  const { run, subscriptions, queried } = stockRoute();
  const response = await run([{ id: 'a', broker: 'ths', market: 'A', symbol: '600519', shares: 10, costBasis: 90 }]);
  assert.equal(response.status, 200);
  const data = await response.json();
  const positions = data.brokers.find(broker => broker.broker === 'ibkr').positions;
  assert.equal(positions[0].price, 150);
  assert.equal(positions[0].marketValue, 1500);
  assert.equal(positions[0].pnl, 700);
  assert.equal(positions[0].priceUpdatedAt, clock);
  assert.equal(positions[0].priceSource, 'yahoo');
  assert.deepEqual(positions.slice(1).map(position => [position.price, position.marketValue]), [[5, 500], [6, 1200]]);
  assert.ok(positions.slice(1).every(position => position.priceSource === 'ibkr-flex' && !position.priceUpdatedAt));
  assert.deepEqual(queried.find(([market]) => market === 'US')[1], ['NVDA']);
  assert.deepEqual(subscriptions.find(([, source]) => source === 'ibkr')[2], [{ market: 'US', symbol: 'NVDA' }]);
  assert.deepEqual(subscriptions.find(([, source]) => source === 'manual')[2], [{ market: 'A', symbol: '600519' }]);
});

test('a failed broker fetch preserves its registered symbols while a genuine empty account removes them', async () => {
  const failed = stockRoute({ brokerFails: true });
  await failed.run([]);
  assert.equal(failed.subscriptions.some(([, source]) => source === 'ibkr'), false);
  const empty = stockRoute({ empty: true });
  await empty.run([]);
  assert.deepEqual(empty.subscriptions.find(([, source]) => source === 'ibkr')[2], []);
  assert.deepEqual(empty.subscriptions.find(([, source]) => source === 'manual')[2], []);
});

test('backend responses are mapped by market identity, preserve timestamps, and reject perpetual prices for equity valuation', async () => {
  const env = { CRYPTOSENTRY_API_URL: process.env.CRYPTOSENTRY_API_URL, CRYPTOSENTRY_API_TOKEN: process.env.CRYPTOSENTRY_API_TOKEN };
  process.env.CRYPTOSENTRY_API_URL = 'http://mock-backend'; process.env.CRYPTOSENTRY_API_TOKEN = 'dummy-test-token';
  let perpetual = false; const requests = [];
  try {
    const api = createTsLoader({
      'server-only': {},
      '@/lib/http/fetch': { fetchWithTimeout: async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body) });
        if (url.endsWith('subscriptions')) return Response.json({ ok: true });
        return Response.json({ quotes: [{ market: 'US', symbol: 'NVDA', price: '150', priceBasis: perpetual ? 'perpetual_mark' : 'stock', currency: perpetual ? 'USDT' : 'USD', observedAt: clock, receivedAt: '2026-10-16T03:00:00.000Z', provider: 'yahoo', status: 'closed' }] });
      } },
      '@/lib/stocks/quotes': {},
    })('lib/stocks/backgroundQuotes.ts');
    const quote = (await api.fetchUsQuotes(['NVDA']))[0];
    assert.equal(api.stockQuoteKey({ market: 'A', symbol: '600519' }), api.stockQuoteKey({ market: 'A', symbol: 'sh600519' }));
    assert.notEqual(api.stockQuoteKey({ market: 'A', symbol: 'sh000001' }), api.stockQuoteKey({ market: 'A', symbol: 'sz000001' }));
    assert.equal(quote.priceUpdatedAt, clock);
    assert.equal(quote.priceStatus, 'closed');
    perpetual = true;
    assert.equal((await api.fetchUsQuotes(['NVDA']))[0].price, 0);
    await api.syncStockSubscriptions(clientId, 'manual', [{ market: 'US', symbol: 'NVDA' }, { market: 'US', symbol: 'nvda' }]);
    const owner = requests.at(-1).body.owner;
    assert.match(owner, /^[a-f0-9]{64}$/);
    assert.equal(requests.at(-1).body.symbols.length, 1);
    await api.syncStockSubscriptions('22222222-2222-4222-8222-222222222222', 'manual', []);
    assert.notEqual(requests.at(-1).body.owner, owner);
  } finally {
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('legacy cached IBKR reports recover position-specific quote IDs without fetching or mixing option marks', async () => {
  const positions = [{ id: 'nvda-stock' }, { id: 'nvda-call-1' }, { id: 'nvda-call-2' }];
  const cached = { ts: Date.now(), data: { positions, cash: [], trades: [], quotes: [{ symbol: 'NVDA', price: 100 }, { symbol: 'NVDA', price: 5 }, { symbol: 'NVDA', price: 6 }] } };
  const api = createTsLoader({
    'server-only': {},
    '@/lib/cache/upstash': { redis: { get: async () => cached } },
    '@/lib/http/fetch': { fetchWithTimeout: async () => assert.fail('fresh reports must not be fetched again') },
  })('lib/ibkr/flex.ts');
  const result = await api.fetchIbkrSnapshot({ flexToken: 'dummy', flexQueryId: 'dummy' });
  assert.deepEqual(result.quotes.map(quote => [quote.positionId, quote.price]), [['nvda-stock', 100], ['nvda-call-1', 5], ['nvda-call-2', 6]]);
});
