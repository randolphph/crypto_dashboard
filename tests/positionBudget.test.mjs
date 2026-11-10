import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';
const { assertPositionBudget, getPositionBudget, parsePositionLimitPercent } = createTsLoader()('lib/accumulation/positionLimit.ts');
const target = (id, positionLimitShare, patch = {}) => ({ id, symbol: id, market: 'US', sector: 'AI', ma20: 120, tierOffsets: [-.03, -.06, -.1], status: 'active', ...(positionLimitShare !== undefined ? { positionLimitShare } : {}), ...patch });
function withStore(run, seed) {
  const originalWindow = global.window, originalStorage = global.localStorage, map = new Map();
  global.localStorage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };global.window = { localStorage: global.localStorage };
  if (seed) map.set('crypto-dashboard-accumulation-plan', JSON.stringify({ version: 2, state: seed }));
  const fresh = () => createTsLoader()('stores/accumulationStore.ts').useAccumulationStore;
  try { run(fresh(), fresh); } finally { global.window = originalWindow;global.localStorage = originalStorage; }
}

test('all allocations share the total-asset denominator and exact decimal sums may equal the AI budget', () => {
  assertPositionBudget([target('a', .1), target('b', .2)], .3);
  assert.deepEqual(getPositionBudget([target('a', .1), target('b', .2), target('unset')], .4), { allocatedShare: .3, remainingShare: .1, excessShare: 0, overBudget: false });
  assert.throws(() => assertPositionBudget([target('a', .1), target('b', .2)], .29), /超过 AI 总仓位/);
  assert.equal(getPositionBudget([target('a', .1), target('b', .2)], .29).excessShare, .01);
  assert.equal(parsePositionLimitPercent('33.3'), .333);
  assertPositionBudget([target('a', parsePositionLimitPercent('10.1')), target('b', parsePositionLimitPercent('20.2'))], parsePositionLimitPercent('30.3'));
});

test('add, edit and import reject oversubscription atomically while clear/remove release capacity', () => withStore((store, fresh) => {
  const state = () => store.getState();
  state().replaceAll([target('NVDA', .15), target('MSFT', .2)]);
  assert.throws(() => state().addTarget(target('AMD', .1)), /超过 AI 总仓位/);
  assert.equal(state().targets.length, 2);
  assert.throws(() => state().updateTarget('NVDA', { positionLimitShare: .21 }), /超过 AI 总仓位/);
  assert.equal(state().targets[0].positionLimitShare, .15);
  state().updateTarget('NVDA', { positionLimitShare: .2 });
  assert.equal(getPositionBudget(state().targets, .4).remainingShare, 0);
  state().updateTarget('NVDA', { positionLimitShare: undefined });
  state().addTarget(target('AMD', .2));
  const before = structuredClone(state().targets);
  assert.throws(() => state().replaceAll([target('a', .25), target('b', .2)]), /超过 AI 总仓位/);
  assert.deepEqual(state().targets, before);
  assert.deepEqual(fresh().getState().targets, JSON.parse(JSON.stringify(before)));
  state().removeTarget('MSFT');
  assert.equal(getPositionBudget(state().targets, .4).remainingShare, .2);
}));

test('lowering the global target cannot invalidate assigned limits and invalid targets never mutate settings', () => withStore(store => {
  store.getState().replaceAll([target('a', .1), target('b', .2)]);
  assert.throws(() => store.getState().setTargetPortfolioShare(.29), /超过 AI 总仓位/);
  assert.equal(store.getState().targetPortfolioShare, .4);
  store.getState().setTargetPortfolioShare(.3);assert.equal(store.getState().targetPortfolioShare, .3);
  for (const value of [NaN, Infinity, -1, 1.01]) assert.throws(() => store.getState().setTargetPortfolioShare(value), /0% 到 100%/);
  assert.equal(store.getState().targetPortfolioShare, .3);
  store.getState().replaceAll([target('unset')]);store.getState().setTargetPortfolioShare(0);
  assert.throws(() => store.getState().updateTarget('unset', { positionLimitShare: .01 }));
  assert.equal(store.getState().targets[0].positionLimitShare, undefined);
}));

test('legacy overallocated plans remain intact and permit gradual reductions but no increased allocation or invalid import', () => withStore(store => {
  const state = () => store.getState();
  assert.equal(getPositionBudget(state().targets, state().targetPortfolioShare).allocatedShare, .9);
  state().updateTarget('a', { positionLimitShare: .25 });
  assert.equal(getPositionBudget(state().targets, .4).allocatedShare, .85);
  assert.throws(() => state().updateTarget('a', { positionLimitShare: .26 }));
  state().addTarget(target('unset'));
  const unset = state().targets.at(-1).id;
  assert.throws(() => state().updateTarget(unset, { positionLimitShare: .01 }));
  assert.throws(() => state().replaceAll([target('a', .3), target('b', .3)]));
  assert.equal(state().targets[0].note, 'preserve');
  assert.deepEqual(state().targets[0].tierPrices, [100, 90, 80]);
  state().replaceAll([target('a', .2), target('b', .2)]);
  assert.equal(getPositionBudget(state().targets, .4).overBudget, false);
}, { targets: [target('a', .3, { note: 'preserve', tierPrices: [100,90,80] }), target('b', .3), target('c', .3)], targetPortfolioShare: .4 }));

test('paused and completed targets still reserve quota; sequential updates use the latest allocation', () => withStore(store => {
  store.getState().replaceAll([target('a', .1, { status: 'paused' }), target('b', .2, { status: 'done' }), target('c')]);
  store.getState().updateTarget('c', { positionLimitShare: .1 });
  assert.throws(() => store.getState().updateTarget('a', { positionLimitShare: .11 }));
  assert.equal(getPositionBudget(store.getState().targets, .4).allocatedShare, .4);
  store.getState().updateTarget('b', { positionLimitShare: .1 });
  store.getState().updateTarget('a', { positionLimitShare: .2 });
  assert.throws(() => store.getState().updateTarget('b', { positionLimitShare: .2 }));
}));

test('unified allocation save changes global and individual limits in one validated, persisted update', () => withStore((store, fresh) => {
  const state = () => store.getState();
  const original = target('a', .2, { note: 'keep', tierPrices: [110, 100, 90] });
  state().replaceAll([original, target('b', .1)]);
  let notifications = 0;
  const stop = store.subscribe(() => notifications++);
  // Lowering the total first would reject, but a complete valid plan is atomic.
  state().setAllocationPlan(.2, { a: .1, b: .1 });
  assert.equal(notifications, 1);
  assert.equal(state().targetPortfolioShare, .2);
  assert.deepEqual(state().targets[0], { ...original, positionLimitShare: .1 });
  assert.equal(fresh().getState().targetPortfolioShare, .2);
  const before = structuredClone({ targets: state().targets, share: state().targetPortfolioShare });
  for (const [share, limits] of [[.2, { a: .15, b: .1 }], [.2, { a: 0 }], [.2, { a: NaN }], [-1, { a: undefined, b: undefined }]]) {
    assert.throws(() => state().setAllocationPlan(share, limits));
    assert.deepEqual({ targets: state().targets, share: state().targetPortfolioShare }, before);
  }
  assert.equal(notifications, 1);
  state().setAllocationPlan(0, { a: undefined, b: undefined });
  assert.equal(state().targets[0].positionLimitShare, undefined);
  assert.equal(fresh().getState().targets[0].positionLimitShare, undefined);
  stop();
}));

test('unified settings preserve latest target metadata and validate targets added while editing', () => withStore(store => {
  const state = () => store.getState();
  state().replaceAll([target('a', .1), target('b', .1)]);
  state().updateTarget('a', { note: 'updated while dialog open', status: 'paused' });
  state().addTarget(target('c', .1));
  const addedId = state().targets[2].id;
  assert.throws(() => state().setAllocationPlan(.2, { a: .1, b: .1 }));
  assert.equal(state().targetPortfolioShare, .4);
  state().removeTarget('b');
  state().setAllocationPlan(.3, { a: .2, b: .1 });
  assert.equal(state().targets.length, 2);
  assert.equal(state().targets[0].note, 'updated while dialog open');
  assert.equal(state().targets[0].status, 'paused');
  assert.equal(state().targets[1].id, addedId);
  assert.equal(state().targets[1].positionLimitShare, .1);
}));
