import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { deriveOptionExposure, summarizeOptionExposure } = createTsLoader()('lib/stocks/optionExposure.ts');
const fx = { cnyUsd: 0.14, hkdUsd: 0.125, krwUsd: 0.001 };
const option = (extra = {}) => ({ id: 'call', broker: 'ibkr', market: 'US', symbol: 'NVDA', kind: 'option',
  shares: 2, multiplier: 100, price: 8, currency: 'USD', marketValueUsd: 1600, optionType: 'call', strike: 190, ...extra });
const stock = { id: 'stock', broker: 'ibkr', market: 'US', symbol: 'NVDA', kind: 'stock', shares: 100,
  price: 200, currency: 'USD', marketValueUsd: 20000 };
const derive = (positions, quotes = [], rates = fx) => deriveOptionExposure(positions, quotes, rates);

test('calls and puts classify by underlying price and strike, independently of buy or sell direction', () => {
  const rows = derive([stock, option(), option({ id: 'short-call', shares: -2 }),
    option({ id: 'otm-call', strike: 210 }), option({ id: 'itm-put', optionType: 'put', strike: 210 }),
    option({ id: 'otm-put', optionType: 'put', strike: 190, shares: -3 })]);
  assert.deepEqual(rows.map(r => r.moneyness), ['itm', 'itm', 'otm', 'itm', 'otm']);
  assert.deepEqual(rows.map(r => r.notionalUsd), [40000, 40000, 40000, 40000, 60000]);
  const total = summarizeOptionExposure(rows);
  assert.equal(total.itm.notionalUsd, 120000);
  assert.equal(total.otm.notionalUsd, 100000);
  assert.equal(total.itm.count, 3);
  assert.equal(total.otm.count, 2);
  assert.equal(total.covered, 5);
});

test('equal strikes remain explicitly ATM and join the non-intrinsic bucket without disappearing', () => {
  const rows = derive([stock, option({ strike: 200 }), option({ id: 'put', optionType: 'put', strike: 200 })]);
  assert.deepEqual(rows.map(r => r.moneyness), ['atm', 'atm']);
  const total = summarizeOptionExposure(rows);
  assert.equal(total.itm.notionalUsd, 0);
  assert.equal(total.otm.notionalUsd, 80000);
  assert.equal(total.otm.atmCount, 2);
});

test('option-only holdings use shared underlying quotes, actual multipliers and FX, never premiums or strikes', () => {
  const row = derive([option({ market: 'HK', symbol: '0700', currency: 'HKD', strike: 380, multiplier: 500 })],
    [{ market: 'HK', symbol: '0700', currency: 'HKD', price: 400 }])[0];
  assert.equal(row.moneyness, 'itm');
  assert.equal(row.underlyingQuantity, 1000);
  assert.equal(row.notionalUsd, 50000);
  assert.equal(derive([option()])[0].notionalUsd, null);
  assert.equal(derive([option()])[0].moneyness, null);
});

test('missing metadata stays unclassified and incomplete bucket totals expose known subtotals', () => {
  const missing = derive([stock, option({ id: 'unknown', optionType: undefined }), option({ id: 'no-strike', strike: undefined })]);
  assert.deepEqual(missing.map(r => r.moneyness), [null, null]);
  assert.equal(summarizeOptionExposure(missing).unclassified.length, 2);
  const rows = derive([stock, option(), option({ id: 'missing', multiplier: undefined })]);
  const total = summarizeOptionExposure(rows);
  assert.equal(total.itm.notionalUsd, null);
  assert.equal(total.itm.knownNotionalUsd, 40000);
  assert.equal(total.covered, 1);
  assert.equal(rows[1].underlyingQuantity, null);
  const noFx = derive([option({ market: 'HK', symbol: '0700' })], [{ market: 'HK', symbol: '0700', currency: 'HKD', price: 400 }], { ...fx, hkdUsd: 0 })[0];
  assert.equal(noFx.notionalUsd, null);
  assert.ok(noFx.missing.includes('缺少汇率'));
  for (const strike of [0, -1, NaN]) assert.equal(derive([stock, option({ strike })])[0].moneyness, null);
});

test('price updates move a contract between categories without changing positions or netting shorts', () => {
  const p = option({ shares: -2, strike: 205 });
  assert.equal(derive([stock, p])[0].moneyness, 'otm');
  const row = derive([{ ...stock, price: 210 }, p])[0];
  assert.equal(row.moneyness, 'itm');
  assert.equal(row.notionalUsd, 42000);
  assert.equal(p.shares, -2);
});

test('IBKR contracts join their underlying symbol and retain actual contract metadata and multiplier', () => {
  const { parseFlexStatement } = createTsLoader({ 'server-only': {}, '@/lib/cache/upstash': { redis: null } })('lib/ibkr/flex.ts');
  const data = parseFlexStatement(`<FlexQueryResponse><OpenPosition assetCategory="OPT" symbol="NVDA 261218C00210000" underlyingSymbol="NVDA" position="-2" multiplier="100" currency="USD" strike="210" expiry="20261218" putCall="C" positionValue="-1600" />
    <OpenPosition assetCategory="OPT" symbol="NVDA" position="1" multiplier="1" currency="USD" strike="220" expiry="20261218" putCall="P" />
    <OpenPosition assetCategory="OPT" symbol="NVDA" position="1" currency="USD" strike="230" expiry="20261218" putCall="P" /></FlexQueryResponse>`);
  assert.equal(data.positions[0].symbol, 'NVDA');
  assert.equal(data.positions[0].multiplier, 100);
  assert.equal(data.positions[0].optionType, 'call');
  assert.equal(data.positions[0].expiry, '2026-12-18');
  assert.equal(data.positions[0].strike, 210);
  assert.equal(data.quotes[0].price, 8);
  assert.equal(data.positions[1].multiplier, 1);
  assert.equal(data.positions[2].multiplier, undefined);
});

test('real legacy Flex OSI symbols recover underlying, strike and put type without extra report fields', () => {
  const p = option({ id: 'ibkr:pos:COHR  261030P00235000::::USD', symbol: 'COHR  261030P00235000',
    name: 'COHR 30OCT26 235 P', optionType: undefined, strike: undefined });
  const row = derive([p], [{ market: 'US', symbol: 'COHR', currency: 'USD', price: 230 }])[0];
  assert.equal(row.position.symbol, 'COHR');
  assert.equal(row.contract.strike, 235);
  assert.equal(row.contract.optionType, 'put');
  assert.equal(row.contract.expiry, '2026-10-30');
  assert.equal(row.moneyness, 'itm');
  assert.equal(row.notionalUsd, 46000);
  assert.deepEqual(row.missing, []);
});

test('legacy description format recovers metadata when only the underlying symbol is saved', () => {
  const p = option({ id: 'ibkr:pos:COHR::::USD', symbol: 'COHR', name: 'COHR 13NOV26 260 P', optionType: undefined, strike: undefined });
  const row = derive([p], [{ market: 'US', symbol: 'COHR', currency: 'USD', price: 270 }])[0];
  assert.equal(row.contract.strike, 260);
  assert.equal(row.contract.optionType, 'put');
  assert.equal(row.contract.expiry, '2026-11-13');
  assert.equal(row.moneyness, 'otm');
});

test('fresh Flex reports missing optional contract fields decode standard symbols while preserving quote IDs', () => {
  const { parseFlexStatement } = createTsLoader({ 'server-only': {}, '@/lib/cache/upstash': { redis: null } })('lib/ibkr/flex.ts');
  const data = parseFlexStatement('<FlexQueryResponse><OpenPosition assetCategory="OPT" symbol="MCD   261218P00225000" description="MCD 18DEC26 225 P" position="-1" multiplier="100" currency="USD" markPrice="3.5" /></FlexQueryResponse>');
  assert.equal(data.positions[0].symbol, 'MCD');
  assert.equal(data.positions[0].optionType, 'put');
  assert.equal(data.positions[0].strike, 225);
  assert.equal(data.quotes[0].positionId, data.positions[0].id);
  assert.equal(data.quotes[0].price, 3.5);
});

test('cached Flex reports normalize option metadata without refetching IBKR or changing collection time', async () => {
  const p = option({ id: 'ibkr:pos:DRAM  261113P00045000::::USD', symbol: 'DRAM  261113P00045000', name: 'DRAM 13NOV26 45 P', optionType: undefined, strike: undefined });
  const cached = { ts: Date.now(), data: { positions: [p], cash: [], trades: [], quotes: [{ symbol: p.symbol, price: 2.5 }] } };
  const { fetchIbkrSnapshot } = createTsLoader({
    'server-only': {}, '@/lib/cache/upstash': { redis: { get: async () => cached } },
    '@/lib/http/fetch': { fetchWithTimeout: async () => assert.fail('metadata recovery must not request a new report') },
  })('lib/ibkr/flex.ts');
  const previousTime = cached.ts;
  const result = await fetchIbkrSnapshot({ flexToken: 'dummy', flexQueryId: 'dummy' });
  assert.equal(result.positions[0].symbol, 'DRAM');
  assert.equal(result.positions[0].optionType, 'put');
  assert.equal(result.positions[0].strike, 45);
  assert.equal(result.positions[0].expiry, '2026-11-13');
  assert.equal(result.quotes[0].positionId, p.id);
  assert.equal(cached.ts, previousTime);
});

test('compact and padded OSI symbols preserve fractional strikes and reject invalid dates or arbitrary names', () => {
  const { parseOptionSymbol, normalizeOptionPosition } = createTsLoader()('lib/stocks/optionContract.ts');
  assert.deepEqual(parseOptionSymbol('F261218C00012500'), { underlying: 'F', optionType: 'call', strike: 12.5, expiry: '2026-12-18' });
  assert.equal(normalizeOptionPosition(option({ symbol: 'F261218C00012500', optionType: undefined, strike: undefined })).symbol, 'F');
  assert.equal(parseOptionSymbol('NVDA261218P00210000.US').underlying, 'NVDA');
  for (const text of ['COHR', 'company call put', 'COHR261332P00235000', 'COHR 31FEB26 235 P']) assert.equal(parseOptionSymbol(text), null);
  const explicit = normalizeOptionPosition(option({ id: 'ibkr:pos:COHR  261030P00235000::::USD', symbol: 'COHR', strike: 240, optionType: 'call', expiry: '2026-11-13' }));
  assert.equal(explicit.strike, 240);
  assert.equal(explicit.optionType, 'call');
  assert.equal(explicit.expiry, '2026-11-13');
});
