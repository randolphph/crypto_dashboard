import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const load = createTsLoader();
const { valueGoldHoldings, validateGoldHolding } = load('lib/portfolio/gold.ts');
const { buildClassificationAssets, aggregateAssetCategories, DEFAULT_ASSET_CATEGORIES } = load('lib/portfolio/assetCategories.ts');
const { buildSnapshot, snapshotFingerprint } = load('lib/portfolio/snapshot.ts');
const { snapshotToAiJson, snapshotToMarkdown } = load('lib/snapshot/export.ts');
const now = Date.now();
const quote = { symbol: 'Au99.99', currency: 'CNY', unit: 'gram', price: 700, updatedAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(), source: 'sina-sge', status: 'live' };
const fx = { cnyUsd: .14, hkdUsd: .125, krwUsd: .001 };
const gold = (updates = {}) => ({ id: 'g1', name: '金条', grams: 25.5, buyPricePerGram: 600, currency: 'CNY', ...updates });
const config = () => ({ categories: structuredClone(DEFAULT_ASSET_CATEGORIES), assignments: {}, redirects: {}, defaultCategoryId: 'cash' });

test('gold separates live market value from purchase cost and converts FX exactly once', () => {
  const result = valueGoldHoldings([gold(), gold({ id: 'g2', grams: 2, buyPricePerGram: 70, currency: 'USD' })], fx, quote);
  assert.equal(result.items[0].costLocal, 15300);
  assert.equal(result.items[0].costUsd, 2142);
  assert.equal(result.items[1].costUsd, 140);
  assert.equal(result.totalCostUsd, 2282);
  assert.equal(result.totalGrams, 27.5);
  assert.equal(result.items[0].valuationBasis, 'spot');
  assert.equal(result.items[0].valueUsd, 2499);
  assert.equal(result.totalUsd, 2695);
  assert.equal(result.pnlUsd, 413);
  assert.equal(result.items[0].priceUpdatedAt, quote.updatedAt);
  assert.equal(result.items[0].valueCny, 17850);
  assert.equal(result.items[0].pnlCny, 2550);
  assert.equal(result.items[0].priceCnyPerGram, 700);
  const changedFx = valueGoldHoldings([gold()], { ...fx, cnyUsd: .15 }, quote);
  assert.equal(changedFx.totalCny, 17850);
  assert.equal(changedFx.pnlCny, 2550);
  assert.equal(changedFx.totalUsd, 2677.5);
  assert.equal(valueGoldHoldings([gold({ grams: .1, buyPricePerGram: .2 })], fx).items[0].costLocal, .02);
  assert.equal(valueGoldHoldings([gold()], { ...fx, cnyUsd: .15 }, quote).totalCostUsd, 2295);
});

test('missing FX preserves domestic CNY market value and PnL while USD totals remain unavailable', () => {
  for (const rates of [undefined, { ...fx, cnyUsd: 0 }, { ...fx, cnyUsd: NaN }]) {
    const result = valueGoldHoldings([gold()], rates, quote);
    assert.equal(result.complete, false);
    assert.equal(result.totalUsd, null);
    assert.equal(result.totalCny, 17850);
    assert.equal(result.totalCostCny, 15300);
    assert.equal(result.pnlCny, 2550);
    assert.equal(result.priceCnyPerGram, 700);
    assert.equal(result.totalCostUsd, null);
    assert.equal(result.pnlUsd, null);
    assert.equal(result.items[0].costLocal, 15300);
    assert.equal(result.items[0].costUsd, null);
  }
  assert.equal(valueGoldHoldings([gold({ currency: 'USD' })], undefined, quote).totalCostUsd, 15300);
});

test('invalid quantities, prices and unsupported currencies are rejected', () => {
  for (const patch of [{ grams: 0 }, { grams: -1 }, { grams: NaN }, { buyPricePerGram: 0 }, { buyPricePerGram: Infinity }, { currency: 'USDT' }, { name: ' ' }, { grams: 1e308, buyPricePerGram: 1e308 }]) assert.throws(() => validateGoldHolding(gold(patch)));
});

test('gold enters its own asset category once while retaining custom classification', () => {
  const input = { banks: [], customAssets: [{ id: 'old', name: '旧资产', value: 100 }], gold: valueGoldHoldings([gold()], fx, quote).items };
  const rows = buildClassificationAssets(input);
  assert.equal(rows.reduce((sum, row) => sum + row.value, 0), 2599);
  assert.equal(aggregateAssetCategories(rows, config()).find(row => row.id === 'gold').value, 2499);
  const changed = config(); changed.assignments['gold:g1'] = 'stocks';
  assert.equal(aggregateAssetCategories(rows, changed).find(row => row.id === 'stocks').value, 2499);
  assert.equal(aggregateAssetCategories(rows, changed).find(row => row.id === 'gold').value, 0);
});

function storageTest(fn) {
  const previousWindow = global.window, previousStorage = global.localStorage;
  const map = new Map();
  global.localStorage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  global.window = { localStorage: global.localStorage };
  try { fn(map); } finally { global.window = previousWindow; global.localStorage = previousStorage; }
}

test('gold add, edit, reload and removal preserve units and do not alter legacy custom assets', () => storageTest(map => {
  map.set('crypto-dashboard-custom-assets', JSON.stringify({ version: 1, state: { assets: [{ id: 'old', name: '旧资产', value: 100 }] } }));
  const store = createTsLoader()('stores/goldStore.ts').useGoldStore;
  store.getState().addHolding(gold());
  store.getState().updateHolding('g1', { grams: 30.25 });
  assert.throws(() => store.getState().updateHolding('g1', { grams: -1 }));
  const restored = createTsLoader()('stores/goldStore.ts').useGoldStore;
  assert.deepEqual(restored.getState().holdings, [gold({ grams: 30.25 })]);
  assert.equal(createTsLoader()('stores/customAssetStore.ts').useCustomAssetStore.getState().assets[0].value, 100);
  restored.getState().removeHolding('g1');
  assert.equal(createTsLoader()('stores/goldStore.ts').useGoldStore.getState().holdings.length, 0);
}));

test('old category settings acquire gold without losing assignments or duplicating an existing gold category', () => storageTest(map => {
  map.set('crypto-dashboard-asset-categories', JSON.stringify({ version: 2, state: { ...config(), categories: [...DEFAULT_ASSET_CATEGORIES.filter(c => c.id !== 'gold'), { id: 'old-gold', name: '黄金', color: '#123456' }], assignments: { 'custom:old': 'stocks', 'gold:g1': 'old-gold' } } }));
  const store = createTsLoader()('stores/assetCategoryStore.ts').useAssetCategoryStore;
  assert.equal(store.getState().categories.filter(c => c.name === '黄金').length, 1);
  assert.equal(store.getState().categories.find(c => c.id === 'gold').color, '#123456');
  assert.equal(store.getState().assignments['custom:old'], 'stocks');
  assert.equal(store.getState().assignments['gold:g1'], 'gold');
  store.getState().deleteCategory('gold', 'cash');
  assert.equal(createTsLoader()('stores/assetCategoryStore.ts').useAssetCategoryStore.getState().categories.some(c => c.id === 'gold'), false);
}));

test('snapshot exports retain gold grams and buy price, and gold is excluded from implied cash', () => {
  const holdings = valueGoldHoldings([gold()], fx, quote).items;
  const snapshot = buildSnapshot({ wallet: '0x123', gold: holdings, portfolio: { totalUsd: 2599, assetsUsd: 2599, otherUsd: 2499 } });
  const json = snapshotToAiJson(snapshot);
  assert.deepEqual(json.gold, holdings);
  assert.equal(json.summary.byCategory.goldCostUsd, 2142);
  assert.equal(json.summary.byCategory.goldMarketValueUsd, 2499);
  assert.equal(json.summary.byCategory.cashImpliedUsd, 100);
  const markdown = snapshotToMarkdown(snapshot);
  assert.match(markdown, /上金所 Au99.99/);
  assert.match(markdown, /25\.5/);
  assert.match(markdown, /CNY/);
  assert.notEqual(snapshotFingerprint(snapshot), snapshotFingerprint({ ...snapshot, gold: [{ ...holdings[0], grams: 30.6, buyPricePerGram: 500 }] }));
});

test('missing gold quotes block history and cannot produce a zero-valued snapshot or invented AI share', () => {
  const { assessHistoryRecording } = load('lib/portfolio/history.ts');
  const value = valueGoldHoldings([gold()], fx);
  assert.equal(value.totalCostUsd, 2142);
  assert.equal(value.totalUsd, null);
  assert.equal(value.items[0].valuationBasis, 'unavailable');
  assert.equal(assessHistoryRecording({ totalValue: NaN, sources: [{ label: '黄金', required: true, value: value.totalUsd ?? undefined }] }).status, 'blocked');
  const { deriveFunding } = load('lib/accumulation/derive.ts');
  assert.ok(Number.isNaN(deriveFunding([], NaN, NaN, 0).aiShareOfPortfolio));
});

test('stale quotes retain provenance and expire without falling back to purchase cost', () => {
  const stale = { ...quote, updatedAt: new Date(now - 5 * 60_000).toISOString() };
  const value = valueGoldHoldings([gold()], fx, stale, now);
  assert.equal(value.totalUsd, 2499);
  assert.equal(value.priceStatus, 'stale');
  assert.equal(value.items[0].priceUpdatedAt, stale.updatedAt);
  const { assessHistoryRecording } = load('lib/portfolio/history.ts');
  assert.equal(assessHistoryRecording({ totalValue: value.totalUsd, sources: [{ label: '黄金', required: true, value: value.totalUsd, warnings: ['行情已延迟'] }] }).status, 'estimated');
  const holiday = valueGoldHoldings([gold()], fx, stale, now + 8 * 24 * 60 * 60_000);
  assert.equal(holiday.priceStatus, 'stale');
  assert.equal(holiday.totalCny, 17850);
  const expired = valueGoldHoldings([gold()], fx, stale, now + 15 * 24 * 60 * 60_000);
  assert.equal(expired.totalUsd, null);
  assert.equal(expired.totalCostUsd, 2142);
});

test('Sina SGE quotes use the last trade field and explicit Beijing timestamps, never another contract', () => {
  const { parseGoldQuote, goldQuoteStatus } = load('lib/gold/quote.ts');
  const stamp = new Date(now + 8 * 60 * 60_000).toISOString().slice(0, 19).replace('T', ' ');
  const fields = ['AU9999', '黄金99', 'Au99.99', '700', '695', '690', '692', '710', '680', '691', '698', '701', '100', '200', '1000', '700000', stamp, '1.45%'];
  const payload = entries => `var hq_str_SGE_AU9999="${entries.join(',')}";`;
  const parsed = parseGoldQuote(payload(fields), now);
  assert.equal(parsed.price, 700);
  assert.equal(parsed.currency, 'CNY');
  assert.equal(parsed.unit, 'gram');
  assert.equal(parsed.source, 'sina-sge');
  assert.equal(parsed.updatedAt, new Date(now - now % 1000).toISOString());
  assert.equal(parsed.status, 'live');
  for (const [index, value] of [[0, 'AUTD'], [2, 'Au(T+D)'], [3, '0'], [3, 'NaN'], [3, '-'], [3, '700xyz'], [16, 'bad'], [16, '2026-02-30 10:00:00'], [16, new Date(now + 8 * 60 * 60_000 + 120_000).toISOString().slice(0, 19).replace('T', ' ')]]) {
    const changed = [...fields]; changed[index] = value;
    assert.throws(() => parseGoldQuote(payload(changed), now));
  }
  assert.throws(() => parseGoldQuote('var hq_str_gds_AU9999="700";', now));
  assert.throws(() => parseGoldQuote('var hq_str_SGE_AU9999="";', now));
  assert.equal(goldQuoteStatus({ ...quote, unit: 'troy_ounce' }, now), 'unavailable');
  assert.equal(goldQuoteStatus({ ...quote, source: 'gold-api', currency: 'USD', symbol: 'XAU' }, now), 'unavailable');
});

test('live snapshot market value is excluded from cash; old cost snapshots still export correctly', () => {
  const holdings = valueGoldHoldings([gold()], fx, quote).items;
  const old = { ...holdings[0], valuationBasis: 'cost', valueUsd: 2142, costUsd: undefined, priceUpdatedAt: undefined };
  const snapshot = buildSnapshot({ wallet: '0x123', gold: [old], portfolio: { totalUsd: 2242 } });
  assert.equal(snapshotToAiJson(snapshot).summary.byCategory.cashImpliedUsd, 100);
  assert.equal(snapshotToAiJson(snapshot).summary.byCategory.goldCostUsd, 2142);
  const noCost = buildSnapshot({ wallet: '0x123', gold: valueGoldHoldings([gold({ currency: 'HKD' })], { ...fx, hkdUsd: 0 }, quote).items, portfolio: { totalUsd: 2599 } });
  assert.equal(snapshotToAiJson(noCost).summary.byCategory.cashImpliedUsd, 100);
  assert.equal(snapshotToAiJson(noCost).summary.byCategory.goldCostUsd, null);
});
