import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { assessHistoryRecording, shouldRecordHistory, exportHistoryCsv, parseHistoryCsv } = createTsLoader()('lib/portfolio/history.ts');
const source = (patch = {}) => ({ label: '链上钱包', required: true, value: 500, ...patch });
const assess = (sources, extra = {}) => assessHistoryRecording({ totalValue: 1000, sources, ...extra });

test('complete valuations and genuine zero sources can record normally', () => {
  assert.equal(assess([source(), source({ label: 'OKX', value: 0 })]).status, 'ready');
});

test('cached complete valuations keep recording despite age and failed refresh warnings', () => {
  const result = assess([source({ warnings: ['数据更新超过 1 小时', '更新失败，显示缓存'] })]);
  assert.equal(result.status, 'estimated');
  assert.equal(result.canRecord, true);
  assert.equal(result.warnings.length, 2);
});

test('background query failure with a retained valuation is an estimate, not a freeze', () => {
  assert.equal(assess([source({ error: 'HTTP 502' })]).canRecord, true);
  assert.equal(assess([source({ error: 'HTTP 502' })]).status, 'estimated');
});

test('partial valuations are recorded explicitly as estimates', () => {
  assert.equal(assess([source({ warnings: ['Price unavailable: DUST'] })]).status, 'estimated');
  const longport = assess([source({ label: '股票与券商现金', value: 149022, dataQuality: { complete: false, errors: ['Longport: token expired'] } })]);
  assert.equal(longport.status, 'estimated');
  assert.match(longport.warnings[0], /Longport: token expired/);
  assert.equal(assess([source({ dataQuality: { complete: false, errors: [] } })]).status, 'estimated');
  assert.equal(assess([source({ value: 0, dataQuality: { complete: false, errors: ['account failed'] } })]).status, 'blocked');
});

test('missing source, invalid source, and unusable initial wallet cannot become a zero point', () => {
  for (const patch of [{ value: undefined }, { value: NaN }, { value: Infinity }, { value: 0, usable: false, error: '查询失败' }]) {
    const result = assess([source(patch)]);
    assert.equal(result.status, 'blocked');
    assert.equal(result.canRecord, false);
    assert.match(result.blockers[0], /链上钱包/);
  }
});

test('loading sources wait for a valuation, disabled sources do not block', () => {
  assert.equal(assess([source({ value: undefined, loading: true })]).status, 'loading');
  assert.equal(assess([source({ required: false, value: undefined, loading: true, error: 'unused' })]).status, 'ready');
});

test('missing FX and nonfinite or zero totals prevent recording', () => {
  assert.equal(assess([source({ label: '银行汇率', value: undefined })]).status, 'blocked');
  for (const totalValue of [0, -10, NaN, Infinity]) assert.equal(assess([], { totalValue }).canRecord, false);
});

test('duplicate renders and remounts do not append identical points, hourly observations do', () => {
  const previous = { timestamp: 1000, value: 1000 };
  assert.equal(shouldRecordHistory(previous, { value: 1000 }, 2000), false);
  assert.equal(shouldRecordHistory(previous, { value: 1000 }, 1000 + 60 * 60 * 1000), true);
  assert.equal(shouldRecordHistory(previous, { value: 1100 }, 2000), true);
  assert.equal(shouldRecordHistory(undefined, { value: 1000 }, 2000), true);
});

test('quality transitions are recorded even when the valuation is unchanged', () => {
  const estimated = { value: 1000, quality: 'estimated', warnings: ['缓存'] };
  assert.equal(shouldRecordHistory({ timestamp: 1000, value: 1000 }, estimated, 2000), true);
  assert.equal(shouldRecordHistory({ timestamp: 1000, ...estimated }, estimated, 2000), false);
  assert.equal(shouldRecordHistory({ timestamp: 1000, ...estimated }, { value: 1000 }, 2000), true);
});

test('CSV retains estimate provenance and accepts legacy three-column history', () => {
  const rows = [{ timestamp: 1000, value: 1000 }, { timestamp: 2000, value: 999, quality: 'estimated', warnings: ['API failed, using cache', 'Quote "DUST" unavailable\nretrying'] }];
  assert.deepEqual(parseHistoryCsv(exportHistoryCsv(rows)), rows);
  assert.deepEqual(parseHistoryCsv('timestamp,date,value_usd\r\n1000,1970-01-01,1000\r\n'), [rows[0]]);
  assert.equal(parseHistoryCsv('timestamp,date,value_usd\n0,date,10\n1000,date,NaN\n1000,date,Infinity\n999999999999999999999,date,10').length, 0);
});

test('existing persisted history survives appended estimates, reload, import, and removal', async () => {
  const now = Date.now();
  const legacy = { timestamp: now - 3 * 86400000, value: 1500 };
  const storage = new Map([['crypto-dashboard-portfolio-history', JSON.stringify({ state: { snapshots: [legacy] }, version: 2 })]]);
  const originalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  globalThis.window = { localStorage: globalThis.localStorage };
  try {
    const { usePortfolioHistoryStore: store } = createTsLoader()('stores/portfolioHistoryStore.ts');
    assert.deepEqual(store.getState().snapshots, [legacy]);
    store.getState().addSnapshot(1400, { quality: 'estimated', warnings: ['Longport: token expired'] });
    const estimate = store.getState().snapshots.at(-1);
    assert.equal(estimate.quality, 'estimated');
    assert.deepEqual(store.getState().snapshots[0], legacy);
    await store.persist.rehydrate();
    assert.deepEqual(store.getState().snapshots.at(-1), estimate);
    const imported = { timestamp: now - 2 * 86400000, value: 1450 };
    store.getState().importSnapshots([imported]);
    assert.deepEqual(store.getState().snapshots, [legacy, imported, estimate]);
    store.getState().removeSnapshot(imported.timestamp);
    assert.deepEqual(store.getState().snapshots, [legacy, estimate]);
  } finally { globalThis.localStorage = originalStorage; globalThis.window = originalWindow; }
});
