import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';
const { buildStackedRungsModel, CAPACITY_SEGMENTS, capacityY } = createTsLoader()('lib/accumulation/stackedRungs.ts');
const row = (symbol, currentValue, positionLimitShare) => ({ target: { id: symbol, symbol, sector: 'AI', positionLimitShare }, currentValue });

test('F7 gives every configured asset exactly thirty/forty/thirty rungs and fills against its total-asset limit', () => {
  const [target] = buildStackedRungsModel([row('NVDA', 2600, .05)], 100000);
  assert.deepEqual(CAPACITY_SEGMENTS.map(segment => segment.rungs), [30, 40, 30]);
  assert.equal(target.current, .026);assert.equal(target.limit, .05);assert.equal(target.usage, .52);assert.equal(target.progress, .52);
  assert.equal(target.rungs.length, 100);
  for (const [band, count] of [[0,30],[1,40],[2,30]]) assert.equal(target.rungs.filter(rung => rung.band === band).length, count);
  assert.equal(target.rungs.filter(rung => rung.band === 0).reduce((sum, rung) => sum + rung.fraction, 0), 30);
  assert.equal(target.rungs.filter(rung => rung.band === 1).reduce((sum, rung) => sum + rung.fraction, 0), 22);
  assert.equal(target.rungs.filter(rung => rung.band === 2).reduce((sum, rung) => sum + rung.fraction, 0), 0);
  assert.equal(capacityY(.3), 210);assert.equal(capacityY(.7), 128);assert.equal(capacityY(1), 66);
});

test('fractional progress and deterministic rung styling remain exact without rounding up exposure', () => {
  const input = [row('fractional', 3261.7, .05)];
  const [target] = buildStackedRungsModel(input, 100000);
  assert.equal(target.progress, .65234);
  assert.ok(Math.abs(target.rungs.reduce((sum, rung) => sum + rung.fraction, 0) - 65.234) < 1e-10);
  assert.ok(target.rungs.some(rung => rung.fraction > 0 && rung.fraction < 1));
  assert.deepEqual(buildStackedRungsModel(input, 100000), [target]);
});

test('overflow and negative values retain actual shares while the capacity indicator stays bounded', () => {
  const [over, negative] = buildStackedRungsModel([row('MSFT', 8000, .05), row('short', -1000, .05)], 100000);
  assert.equal(over.current, .08);assert.equal(over.usage, 1.6);assert.equal(over.progress, 1);assert.equal(over.overLimit, true);assert.equal(over.gap, -.03);
  assert.equal(negative.current, -.01);assert.equal(negative.progress, 0);assert.equal(negative.belowZero, true);
  assert.equal(capacityY(1.6), capacityY(1));assert.equal(capacityY(-.2), capacityY(0));
});

test('unset limits and unavailable totals never fabricate positions; all assets and zero holdings remain', () => {
  const input = [row('unset', 1000), row('zero', 0, .05), ...Array.from({ length: 28 }, (_, i) => row(`stock${i}`, i * 10, .03))];
  const original = structuredClone(input), model = buildStackedRungsModel(input, 100000);
  assert.equal(model.length, 30);assert.equal(model[0].limit, null);assert.deepEqual(model[0].rungs, []);
  assert.equal(model[1].current, 0);assert.equal(model[1].progress, 0);assert.ok(model[1].rungs.every(rung => rung.fraction === 0));
  for (const total of [0, -1, NaN, Infinity]) {
    const [unknown] = buildStackedRungsModel([row('unknown', 1000, .05)], total);
    assert.equal(unknown.current, null);assert.equal(unknown.progress, null);assert.equal(unknown.rungs.length, 100);
  }
  assert.deepEqual(input, original);
});

test('old settings default to chart and persist table without losing refresh preferences', () => {
  const previousWindow = global.window, previousStorage = global.localStorage, values = new Map();
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };global.window = { localStorage: global.localStorage };
  try {
    values.set('crypto-dashboard-settings', JSON.stringify({ version: 1, state: { refreshInterval: 5 } }));
    const fresh = () => createTsLoader()('stores/dashboardStore.ts').useDashboardStore;
    const store = fresh();assert.equal(store.getState().aiHoldingsView, 'chart');store.getState().setAiHoldingsView('table');
    assert.equal(fresh().getState().aiHoldingsView, 'table');assert.equal(fresh().getState().refreshInterval, 5);
    assert.equal(JSON.parse(values.get('crypto-dashboard-settings')).state.latestSnapshotPayload, undefined);
  } finally { global.window = previousWindow;global.localStorage = previousStorage; }
});


test('normalized rung geometry supports proportional resizing', () => {
  const { CAPACITY_BASE } = createTsLoader()('lib/accumulation/stackedRungs.ts');
  const fullHeight = CAPACITY_BASE - capacityY(1);
  assert.equal(CAPACITY_BASE - capacityY(1, .5), fullHeight / 2);
  assert.ok(Math.abs((CAPACITY_BASE - capacityY(1, .1)) - fullHeight / 10) < 1e-10);
  for (const progress of [0, .3, .7, 1]) {
    assert.ok(Math.abs((CAPACITY_BASE - capacityY(progress, .5)) * 2 - (CAPACITY_BASE - capacityY(progress))) < 1e-10);
  }
});

test('nonlinear capacity axis expands tiny allocations on one shared, zero-based scale', () => {
  const { buildCapacityAxis, CAPACITY_BASE } = createTsLoader()('lib/accumulation/stackedRungs.ts');
  const limits = [.2, .01, .001], axis = buildCapacityAxis(limits);
  assert.equal(axis.y(0), CAPACITY_BASE);
  assert.equal(axis.y(.2), capacityY(1));
  assert.ok(CAPACITY_BASE - axis.y(.001) > 20); // A 0.1% cap remains visible beside 20%.
  assert.ok(CAPACITY_BASE - axis.y(.001) > axis.height * (.001 / .2) * 15);
  let previousY = CAPACITY_BASE;
  for (const share of [.0001, .001, .003, .01, .03, .07, .1, .2]) {
    assert.ok(axis.y(share) < previousY);previousY = axis.y(share);
  }
  for (const cap of limits) {
    assert.ok(axis.y(cap * .3) > axis.y(cap * .7));
    assert.ok(axis.y(cap * .7) > axis.y(cap));
  }
  const reversed = buildCapacityAxis([...limits].reverse());
  assert.deepEqual(axis.ticks, reversed.ticks);
  for (const cap of limits) assert.equal(axis.y(cap), reversed.y(cap));
  assert.deepEqual(limits, [.2, .01, .001]);
});

test('nonlinear axis labels show real shares, avoid collisions, and handle missing or equal limits', () => {
  const { buildCapacityAxis, CAPACITY_BASE } = createTsLoader()('lib/accumulation/stackedRungs.ts');
  for (const limits of [[.2, .001], [.05, .05], [.00001, .1], [1], []]) {
    const axis = buildCapacityAxis(limits);
    assert.equal(axis.ticks[0].value, 0);
    assert.equal(axis.ticks.at(-1).value, axis.max);
    for (let i = 0; i < axis.ticks.length; i++) {
      const tick = axis.ticks[i];assert.equal(tick.y, axis.y(tick.value));assert.ok(Number.isFinite(tick.y));
      if (i) assert.ok(axis.ticks[i - 1].y - tick.y >= 27);
    }
    assert.equal(axis.y(-1), CAPACITY_BASE);assert.equal(axis.y(NaN), CAPACITY_BASE);
    assert.equal(axis.y(2), axis.y(axis.max));
  }
  const empty = buildCapacityAxis([null, 0, -1, NaN, Infinity, 1.1]);
  assert.equal(empty.max, 0);assert.deepEqual(empty.ticks, [{ value: 0, y: CAPACITY_BASE }]);
});
