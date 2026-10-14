import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { valueLiabilities, portfolioNetValue, combineAShareLiabilities } = createTsLoader()('lib/portfolio/liabilities.ts');
const row = (id, amount, currency = 'USD') => ({ id, name: id, amount, currency });

test('net assets subtract each liability once, including mixed currencies and zero or negative equity', () => {
  const result = valueLiabilities([row('financing', 600000, 'CNY'), row('loan', 20000)], { cnyUsd: 0.1, hkdUsd: 0.125, krwUsd: 0.001 });
  assert.equal(result.complete, true);
  assert.equal(result.totalUsd, 80000);
  assert.equal(portfolioNetValue(100000, result.totalUsd), 20000);
  assert.equal(portfolioNetValue(80000, result.totalUsd), 0);
  assert.equal(portfolioNetValue(70000, result.totalUsd), -10000);
  assert.equal(portfolioNetValue(100000, valueLiabilities([]).totalUsd), 100000);
});

test('missing or invalid exchange rates cannot silently discard a non-USD liability', () => {
  for (const fx of [undefined, { cnyUsd: 0 }, { cnyUsd: NaN }, { cnyUsd: -1 }]) {
    const result = valueLiabilities([row('financing', 1000, 'CNY')], fx);
    assert.equal(result.complete, false);
    assert.equal(result.totalUsd, undefined);
    assert.equal(Number.isNaN(portfolioNetValue(100000, result.totalUsd)), true);
  }
  assert.equal(valueLiabilities([row('usd', 1000)]).totalUsd, 1000);
  assert.equal(valueLiabilities([row('paid', 0, 'CNY')]).totalUsd, 0);
});

test('A-share source absorbs debt once while all other account values remain intact', () => {
  const source = [{ label: 'A股', value: 50000 }, { label: '长桥', value: 20000 }, { label: '银行', value: 100000 }];
  const combined = combineAShareLiabilities(source, 'A股', 60000);
  assert.equal(combined[0].value, -10000);
  assert.equal(combined.reduce((sum, item) => sum + item.value, 0), 110000);
  assert.deepEqual(combined.slice(1), source.slice(1));
  assert.equal(source[0].value, 50000);
  const duplicateLabel = combineAShareLiabilities([...source, { label: 'A股', value: 10000 }], 'A股', 60000);
  assert.equal(duplicateLabel.reduce((sum, item) => sum + item.value, 0), 120000);
  assert.equal(combineAShareLiabilities([], 'A股', 60000)[0].value, -60000);
  assert.deepEqual(combineAShareLiabilities([], 'A股', 0), []);
  assert.equal(Number.isNaN(combineAShareLiabilities(source, 'A股', undefined)[0].value), true);
});

test('add, edit, reload, and delete preserve liabilities without changing assets or cash', async () => {
  const storage = new Map([['crypto-dashboard-stock-positions', 'existing positions'], ['crypto-dashboard-cash-balances', 'existing cash']]);
  const oldStorage = globalThis.localStorage, oldWindow = globalThis.window;
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  globalThis.window = { localStorage: globalThis.localStorage };
  try {
    const { useLiabilityStore: store } = createTsLoader()('stores/liabilityStore.ts');
    store.getState().addLiability(row('financing', 600000, 'CNY'));
    store.getState().updateLiability('financing', { name: 'A 股融资', amount: 500000, currency: 'CNY' });
    await store.persist.rehydrate();
    assert.equal(store.getState().liabilities[0].amount, 500000);
    assert.equal(store.getState().liabilities[0].name, 'A 股融资');
    assert.equal(storage.get('crypto-dashboard-stock-positions'), 'existing positions');
    assert.equal(storage.get('crypto-dashboard-cash-balances'), 'existing cash');
    store.getState().removeLiability('financing');
    assert.deepEqual(store.getState().liabilities, []);
  } finally { globalThis.localStorage = oldStorage; globalThis.window = oldWindow; }
});

test('snapshot, JSON and Markdown retain debt; AI cash does not treat borrowing as negative cash', () => {
  const { buildSnapshot, snapshotFingerprint } = createTsLoader()('lib/portfolio/snapshot.ts');
  const { snapshotToAiJson, snapshotToMarkdown } = createTsLoader()('lib/snapshot/export.ts');
  const liabilities = valueLiabilities([row('financing', 600000, 'CNY')], { cnyUsd: 0.1 }).items;
  const snapshot = buildSnapshot({ wallet: '0xabc', liabilities, portfolio: { totalUsd: 40000, assetsUsd: 100000, liabilitiesUsd: 60000 } });
  const json = snapshotToAiJson(snapshot);
  assert.equal(json.totalUsd, 40000);
  assert.equal(json.assetsUsd, 100000);
  assert.equal(json.liabilitiesUsd, 60000);
  assert.equal(json.liabilities[0].amount, 600000);
  assert.equal(json.summary.byCategory.cashImpliedUsd, 100000);
  assert.match(snapshotToMarkdown(snapshot), /负债（已从净资产扣除）/);
  assert.notEqual(snapshotFingerprint(snapshot), snapshotFingerprint({ ...snapshot, liabilities: [{ ...liabilities[0], name: 'renamed' }] }));
});

test('A-share snapshot subtotal and exports show equity after subtracting associated liabilities', () => {
  const { buildSnapshot } = createTsLoader()('lib/portfolio/snapshot.ts');
  const { snapshotToAiJson, snapshotToMarkdown } = createTsLoader()('lib/snapshot/export.ts');
  const broker = (name, cash) => ({ broker: name, positions: [], cash: [{ id: name, broker: name, currency: 'USD', amount: cash, amountUsd: cash, source: 'manual' }], cashUsdValue: cash, positionsUsdValue: 0, totalUsdValue: cash, totalPnlUsd: 0 });
  const liabilities = valueLiabilities([row('financing', 600000, 'CNY')], { cnyUsd: 0.1 }).items;
  assert.equal(liabilities[0].broker, 'ths');
  const snapshot = buildSnapshot({ wallet: '0xabc', stocks: { brokers: [broker('ths', 50000), broker('longport', 20000)] }, banks: [{ bank: '银行', currency: 'USD', amount: 100000, valueUsd: 100000 }], liabilities, portfolio: { totalUsd: 110000, assetsUsd: 170000, liabilitiesUsd: 60000 } });
  const json = snapshotToAiJson(snapshot);
  assert.equal(json.summary.byVenue.ths, -10000);
  assert.equal(json.venues.ths.accountValueUsd, -10000);
  assert.equal(json.summary.byVenue.longport, 20000);
  assert.equal(Object.values(json.summary.byVenue).reduce((sum, value) => sum + value, 0), json.totalUsd);
  assert.match(snapshotToMarkdown(snapshot), /A 股负债/);
});
