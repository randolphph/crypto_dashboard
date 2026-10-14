import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { planAShareTrade } = createTsLoader()('lib/stocks/manualTrade.ts');
const { mergeDailyActivities } = createTsLoader()('lib/ledger/aggregate.ts');
const account = { id: 'account-a-share-manual', platform: 'ths', syncMode: 'manual', enabled: true, name: 'A 股手工账户', baseCurrency: 'CNY' };
const when = new Date(2026, 9, 14, 10, 0).getTime();
const input = (patch = {}) => ({ transactionId: 'one', accountId: account.id, symbol: '600519', side: 'buy', quantity: 100, price: 10, occurredAt: when, commission: 5, tax: 0, otherFee: 0, ...patch });
const cash = [{ id: 'cash', broker: 'ths', currency: 'CNY', amount: 10000 }];

test('new purchase writes opening execution with CNY fees, cash and resulting position', () => {
  const plan = planAShareTrade([], cash, [account], input(), when);
  assert.equal(plan.positions[0].shares, 100);
  assert.equal(plan.positions[0].costBasis, 10);
  assert.equal(plan.positions[0].ledgerAccountId, account.id);
  assert.equal(plan.cash[0].amount, 8995);
  assert.equal(plan.cashDelta, -1005);
  assert.equal(plan.activity.operation, 'open');
  assert.equal(plan.activity.cashFlow, -1005);
  assert.equal(plan.activity.positionAfter, 100);
  assert.equal(plan.activity.source, 'manual');
  assert.equal(plan.activity.status, 'confirmed');
  assert.equal(plan.activity.currency, 'CNY');
  assert.equal(plan.activity.occurredAt, when);
  assert.equal(cash[0].amount, 10000);
});

test('add, reduce and close synchronize quantities, weighted costs and actual net cash', () => {
  const opened = planAShareTrade([], cash, [account], input(), when);
  const added = planAShareTrade(opened.positions, opened.cash, [account], input({ transactionId: 'two', positionId: opened.positions[0].id, quantity: 50, price: 20 }), when + 1000);
  assert.equal(added.positions[0].shares, 150);
  assert.ok(Math.abs(added.positions[0].costBasis - 40 / 3) < 1e-10);
  assert.equal(added.activity.operation, 'add');
  assert.equal(added.cashDelta, -1005);
  const reduced = planAShareTrade(added.positions, added.cash, [account], input({ transactionId: 'three', positionId: added.positions[0].id, side: 'sell', quantity: 50, price: 30, tax: 1, otherFee: 2 }), when + 2000);
  assert.equal(reduced.positions[0].shares, 100);
  assert.equal(reduced.activity.operation, 'reduce');
  assert.equal(reduced.cashDelta, 1492);
  const closed = planAShareTrade(reduced.positions, reduced.cash, [account], input({ transactionId: 'four', positionId: reduced.positions[0].id, side: 'sell', quantity: 100, price: 30 }), when + 3000);
  assert.equal(closed.positions.length, 0);
  assert.equal(closed.activity.operation, 'close');
  assert.equal(closed.activity.positionAfter, 0);
});

test('same-day aggregation preserves all execution IDs, exact fees and count after further trades', () => {
  const plans = [1, 2, 3].map((i) => planAShareTrade([], cash, [account], input({ transactionId: String(i), price: i * 10, occurredAt: when + i * 1000 }), when + i * 1000));
  let merged = mergeDailyActivities(plans.slice(0, 2).map((p) => p.activity));
  merged = mergeDailyActivities([...merged, plans[2].activity]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 300);
  assert.equal(merged[0].price, 20);
  assert.equal(merged[0].commission, 15);
  assert.equal(merged[0].executionCount, 3);
  assert.equal(merged[0].sourceExternalIds.length, 3);
  assert.match(merged[0].note, /3 笔成交/);
});

test('invalid trades do not mutate holdings and do not fall into another platform account', () => {
  const opened = planAShareTrade([], cash, [account], input(), when);
  for (const patch of [{ quantity: 101, side: 'sell' }, { quantity: 1.5 }, { price: NaN }, { price: 0 }, { tax: -1 }, { accountId: 'other' }, { symbol: 'AAPL' }, { occurredAt: NaN }, { positionId: 'missing' }]) {
    const before = structuredClone(opened);
    assert.throws(() => planAShareTrade(opened.positions, opened.cash, [account], input(patch), when));
    assert.deepEqual(opened, before);
  }
  assert.throws(() => planAShareTrade([], cash, [{ ...account, enabled: false }], input(), when));
});

test('unknown prior cost stays unknown and other positions and currency balances are unchanged', () => {
  const p = { id: 'old', broker: 'ths', market: 'A', symbol: '600519', shares: 100 };
  const other = { id: 'us', broker: 'ibkr', market: 'US', symbol: 'AAPL', shares: 2, costBasis: 100 };
  const otherCash = { id: 'usd', broker: 'ibkr', currency: 'USD', amount: 5000 };
  const plan = planAShareTrade([p, other], [...cash, otherCash], [account], input({ positionId: p.id }), when);
  assert.equal(plan.positions[0].costBasis, undefined);
  assert.deepEqual(plan.positions[1], other);
  assert.deepEqual(plan.cash[1], otherCash);
});

function withStorage(fn) {
  const map = new Map();
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  let failureKey;
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { if (key === failureKey) { failureKey = undefined; throw new Error('simulated storage failure'); } map.set(key, value); }, removeItem: (key) => map.delete(key) };
  globalThis.window = { localStorage: storage }; globalThis.localStorage = storage;
  try { return fn(map, (key) => { failureKey = key; }); } finally { globalThis.window = oldWindow; globalThis.localStorage = oldStorage; }
}

test('unified save is idempotent across retry, reload and ledger-only deletion', () => withStorage(() => {
  const load = createTsLoader();
  const stocks = load('stores/stockPositionStore.ts').useStockPositionStore;
  const balances = load('stores/cashBalanceStore.ts').useCashBalanceStore;
  const ledger = load('stores/ledgerStore.ts').useLedgerStore;
  const { saveAShareTrade, recoverAShareTrade } = load('lib/stocks/saveManualTrade.ts');
  balances.setState({ balances: cash });
  assert.equal(saveAShareTrade(input()).recorded, true);
  assert.equal(saveAShareTrade(input()).recorded, false);
  assert.equal(stocks.getState().positions[0].shares, 100);
  assert.equal(balances.getState().balances[0].amount, 8995);
  assert.equal(ledger.getState().aShareExecutions.length, 1);
  ledger.getState().removeActivity(ledger.getState().activities[0].id);
  assert.equal(saveAShareTrade(input()).recorded, false);
  assert.equal(stocks.getState().positions[0].shares, 100);
  assert.equal(recoverAShareTrade(), null);
  const restored = createTsLoader();
  assert.equal(restored('stores/ledgerStore.ts').useLedgerStore.getState().aShareExecutions.length, 1);
  assert.equal(restored('stores/stockPositionStore.ts').useStockPositionStore.getState().positions[0].shares, 100);
}));

test('failed initial journal write leaves all stores unchanged', () => withStorage((map, failOnce) => {
  const load = createTsLoader();
  const { saveAShareTrade } = load('lib/stocks/saveManualTrade.ts');
  failOnce('crypto-dashboard-a-share-pending-trade');
  assert.throws(() => saveAShareTrade(input()));
  assert.deepEqual(load('stores/stockPositionStore.ts').useStockPositionStore.getState().positions, []);
  assert.deepEqual(load('stores/cashBalanceStore.ts').useCashBalanceStore.getState().balances, []);
  assert.deepEqual(load('stores/ledgerStore.ts').useLedgerStore.getState().activities, []);
}));

test('interrupted cash or ledger storage restores visible state and recovers once on reload', () => {
  for (const key of ['crypto-dashboard-cash-balances', 'crypto-dashboard-ledger']) withStorage((map, failOnce) => {
    const load = createTsLoader();
    const balances = load('stores/cashBalanceStore.ts').useCashBalanceStore;
    balances.setState({ balances: cash });
    const { saveAShareTrade } = load('lib/stocks/saveManualTrade.ts');
    failOnce(key);
    assert.throws(() => saveAShareTrade(input()), /交易保存未完成/);
    assert.deepEqual(load('stores/stockPositionStore.ts').useStockPositionStore.getState().positions, []);
    assert.equal(balances.getState().balances[0].amount, 10000);
    assert.equal(load('stores/ledgerStore.ts').useLedgerStore.getState().activities.length, 0);
    assert.ok(map.has('crypto-dashboard-a-share-pending-trade'));
    const restored = createTsLoader();
    const { recoverAShareTrade } = restored('lib/stocks/saveManualTrade.ts');
    recoverAShareTrade(); recoverAShareTrade();
    assert.equal(restored('stores/stockPositionStore.ts').useStockPositionStore.getState().positions[0].shares, 100);
    assert.equal(restored('stores/cashBalanceStore.ts').useCashBalanceStore.getState().balances[0].amount, 8995);
    assert.equal(restored('stores/ledgerStore.ts').useLedgerStore.getState().activities.length, 1);
    assert.equal(map.has('crypto-dashboard-a-share-pending-trade'), false);
  });
});

test('v3 ledger migration keeps existing accounts and trades without fabricating executions', () => withStorage((map) => {
  const existing = planAShareTrade([], cash, [account], input(), when).activity;
  map.set('crypto-dashboard-ledger', JSON.stringify({ version: 3, state: { accounts: [account], activities: [existing], importBatches: [] } }));
  const ledger = createTsLoader()('stores/ledgerStore.ts').useLedgerStore.getState();
  assert.equal(ledger.activities[0].id, existing.id);
  assert.equal(ledger.accounts.find((a) => a.id === account.id).name, account.name);
  assert.deepEqual(ledger.aShareExecutions, []);
}));
