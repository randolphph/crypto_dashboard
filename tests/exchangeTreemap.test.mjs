import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { buildExchangeTreemap } = createTsLoader()('lib/portfolio/exchangeTreemap.ts');
const balance = (asset, usdValue, amount = 1) => ({ asset, amount, usdValue });

test('treemap preserves account equity, merges fragments within accounts and leaves raw data unchanged', () => {
  const accounts = [
    { label: '现货', balances: [balance('BTC', 20000, .2), balance('BTC', 10000, .1), balance('ETH', 6000, 2)] },
    { label: 'U本位合约', balances: [balance('USDT', 5000, 5000)] },
  ];
  const original = structuredClone(accounts);
  const model = buildExchangeTreemap(accounts);
  assert.equal(model.total, 41000);
  assert.equal(model.assetCount, 3);
  assert.equal(model.groups[0].children[0].value, 30000);
  assert.ok(Math.abs(model.groups[0].children[0].balances.reduce((sum, row) => sum + row.amount, 0) - .3) < 1e-12);
  for (const group of model.groups) assert.equal(group.value, group.children.reduce((sum, row) => sum + row.value, 0));
  assert.deepEqual(accounts, original);
});

test('tiny positive values remain real, while debts, unavailable valuations and excluded receipts never become tile areas', () => {
  const model = buildExchangeTreemap([
    { label: '账户资产', balances: [balance('TINY', .001), balance('DEBT', -200), balance('UNKNOWN', NaN), balance('ZERO', 0, 0), { ...balance('aUSDC', 900), dedupedToDefi: true }] },
    { label: '获取失败', balances: [balance('USDT', 500)], error: 'temporarily unavailable' },
  ]);
  assert.equal(model.total, .001);
  assert.equal(model.assetCount, 1);
  assert.equal(model.excludedCount, 2);
  assert.equal(model.groups.length, 1);
  assert.equal(model.groups[0].children[0].name, 'TINY');
  assert.equal(buildExchangeTreemap([{ label: 'empty', balances: [] }]).total, 0);
});

test('large portfolios fold their long tail by account without losing value or underlying rows', () => {
  const accounts = Array.from({ length: 6 }, (_, index) => ({ label: `账户${index}`,
    balances: Array.from({ length: 20 }, (_, i) => balance(`ASSET${i}`, (index + 1) * (i + 1))) }));
  const model = buildExchangeTreemap(accounts);
  assert.equal(model.assetCount, 120);
  assert.ok(model.groups.flatMap(group => group.children).length <= 30);
  assert.equal(model.total, accounts.flatMap(account => account.balances).reduce((sum, row) => sum + row.usdValue, 0));
  for (const group of model.groups) {
    assert.equal(group.value, group.children.reduce((sum, row) => sum + row.value, 0));
    assert.equal(group.children.flatMap(row => row.balances).length, 20);
    assert.ok(group.children.every(row => row.account === group.name));
  }
});
