import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';
const { derivePositionLimit, parsePositionLimitPercent } = createTsLoader()('lib/accumulation/positionLimit.ts');

test('position limit uses the entire portfolio denominator, with exact thirty/seventy percent thresholds and unclipped overflow', () => {
  const middle = derivePositionLimit(2500, 100000, .05);
  assert.equal(middle.currentShare, .025);
  assert.equal(middle.usage, .5);
  assert.equal(middle.progress, .5);
  assert.equal(middle.band, 'medium');
  assert.equal(derivePositionLimit(1500, 100000, .05).band, 'low');
  assert.equal(derivePositionLimit(3500, 100000, .05).band, 'medium');
  const exceeded = derivePositionLimit(6000, 100000, .05);
  assert.equal(exceeded.usage, 1.2);
  assert.equal(exceeded.progress, 1);
  assert.equal(exceeded.band, 'high');
  assert.equal(derivePositionLimit(0, 100000, .05).progress, 0);
  assert.equal(derivePositionLimit(-1000, 100000, .05).progress, 0);
});

test('missing totals or limits never invent capacity usage; edits accept percentages and blank clears the limit', () => {
  for (const total of [0, -1, NaN, Infinity]) assert.equal(derivePositionLimit(1000, total, .05).usage, null);
  assert.equal(derivePositionLimit(NaN, 100000, .05).usage, null);
  for (const limit of [undefined, null, 0, -1, 2, NaN]) assert.equal(derivePositionLimit(1000, 100000, limit).progress, null);
  assert.equal(parsePositionLimitPercent('5'), .05);
  assert.equal(parsePositionLimitPercent('0.25'), .0025);
  assert.equal(parsePositionLimitPercent('100'), 1);
  assert.equal(parsePositionLimitPercent(' '), undefined);
  for (const draft of ['0', '-1', '101', 'NaN', 'Infinity', 'oops']) assert.throws(() => parsePositionLimitPercent(draft));
});

test('old plans preserve anchors while new position limits survive reload, reject invalid changes, and clear independently', () => {
  const originalStorage = global.localStorage, originalWindow = global.window;
  const map = new Map();
  global.localStorage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  global.window = { localStorage: global.localStorage };
  try {
    const target = { id: 'qa', symbol: 'NVDA', market: 'US', sector: 'AI', ma20: 120, tierOffsets: [-.03, -.06, -.1], tierPrices: [110, 100, 90], status: 'active' };
    map.set('crypto-dashboard-accumulation-plan', JSON.stringify({ version: 2, state: { targets: [target], targetPortfolioShare: .4 } }));
    const load = () => createTsLoader()('stores/accumulationStore.ts').useAccumulationStore;
    const store = load();
    assert.equal(store.getState().targets[0].positionLimitShare, undefined);
    store.getState().updateTarget('qa', { positionLimitShare: .05 });
    assert.equal(load().getState().targets[0].positionLimitShare, .05);
    assert.deepEqual(load().getState().targets[0].tierPrices, [110, 100, 90]);
    assert.equal(load().getState().targetPortfolioShare, .4);
    assert.throws(() => store.getState().updateTarget('qa', { positionLimitShare: 1.1 }));
    assert.equal(store.getState().targets[0].positionLimitShare, .05);
    assert.throws(() => store.getState().replaceAll([{ ...target, positionLimitShare: 0 }]));
    store.getState().updateTarget('qa', { positionLimitShare: undefined });
    assert.equal(load().getState().targets[0].positionLimitShare, undefined);
    assert.deepEqual(load().getState().targets[0].tierPrices, [110, 100, 90]);
  } finally { global.localStorage = originalStorage; global.window = originalWindow; }
});
