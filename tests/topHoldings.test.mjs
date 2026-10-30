import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';
const load = createTsLoader();
const { buildTopHoldings, formatAllocationUsd, holdingDotScale } = load('lib/portfolio/topHoldings.ts');
const { aggregateAssetCategories, buildClassificationAssets, DEFAULT_ASSET_CATEGORIES, stockCategoryKey } = load('lib/portfolio/assetCategories.ts');

test('top holdings consolidate across manual category boundaries, net signed values, and preserve every source without mutating buckets', () => {
  const input = [{ label: '股票', details: [
    { id: 'nvda', label: 'NVDA · IBKR', assetLabel: 'NVDA', value: 400, locations: ['IBKR'], sources: [{ label: 'IBKR', value: 400 }] },
    { id: 'short', label: 'Short', value: -200, sources: [{ label: 'IBKR', value: -200 }] },
    { id: 'zero', label: 'Offset', value: 50 },
  ] }, { label: '美股', details: [
    { id: 'nvda', label: 'NVDAB · Binance', assetLabel: 'NVDA', value: 100, locations: ['Binance'], sources: [{ label: 'Binance 现货', value: 100 }] },
    { id: 'zero', label: 'Offset', value: -50 },
    { id: 'invalid', label: 'Invalid', value: NaN },
    { id: 'account', label: '账户净值', value: 100000, aggregateOnly: true },
  ] }];
  const original = structuredClone(input), model = buildTopHoldings(input, 100300);
  assert.equal(model.count, 2);assert.equal(model.totalAssetsValue, 100300);assert.equal(model.rows[0].label, 'NVDA');assert.equal(model.rows[0].value, 500);
  assert.deepEqual(model.rows[0].categories, ['股票', '美股']);assert.deepEqual(model.rows[0].locations, ['IBKR', 'Binance']);assert.equal(model.rows[0].sources.length, 2);
  assert.equal(model.rows[1].value, -200);assert.equal(model.rows[0].share, 500/100300*100);assert.deepEqual(input, original);
});

test('ranking uses exact values before selecting six and uses the full portfolio value as its share denominator', () => {
  const details = Array.from({ length: 12 }, (_, i) => ({ id: String(i), label: 'Asset '+i, value: i + .49 }));
  const totalAssetsValue=1000;
  const model = buildTopHoldings([{ label: 'Crypto', details }], totalAssetsValue);
  assert.equal(model.rows.length, 6);assert.equal(model.count, 12);assert.equal(model.rows[0].id, '11');assert.equal(model.rows.at(-1).id, '6');
  assert.equal(model.totalAssetsValue,totalAssetsValue);assert.equal(model.rows[0].share,11.49/totalAssetsValue*100);
  assert.ok(model.topAbsoluteValue < model.totalAssetsValue);assert.equal(model.rows.at(-1).value, 6.49);
  assert.deepEqual(buildTopHoldings([], 0), { rows: [], count: 0, totalAssetsValue: 0, topAbsoluteValue: 0 });
});

test('cash is excluded only from the displayed candidates: full-asset shares retain cash and residuals, even after category renaming', () => {
  const input=[{id:'cash',label:'流动资金',details:[{id:'usdc',label:'USDC',value:100000},{id:'shared',label:'Shared',value:5000}]},
    {id:'crypto',label:'加密资产',details:[{id:'shared',label:'Shared',value:300},{id:'usdt',label:'USDT',value:100}]}];
  const original=structuredClone(input),model=buildTopHoldings(input,105400);
  assert.equal(model.count,2);assert.equal(model.totalAssetsValue,105400);assert.equal(model.rows[0].value,300);assert.equal(model.rows[0].share,300/105400*100);
  assert.deepEqual(model.rows[0].categories,['加密资产']);assert.equal(model.rows[1].label,'USDT');assert.deepEqual(input,original);
  assert.deepEqual(buildTopHoldings([input[0]],105000),{rows:[],count:0,totalAssetsValue:105000,topAbsoluteValue:0});
});

test('real classification keeps tokenized/native stock identity and option contracts while omitting account-level residuals from instrument rankings', () => {
  const p = (id, extra = {}) => ({ id, symbol: 'NVDA', market: 'US', marketValueUsd: 100, ...extra });
  const assets = buildClassificationAssets({ banks: [], customAssets: [],
    okx: { balances: [{ asset: 'NVDAB', stockSymbol: 'NVDA', amount: 1, usdValue: 200 }], totalUsdValue: 250 },
    deribit: { totalUsdValue: 1000 }, stocks: { brokers: [{ broker: 'ibkr', cash: [], totalUsdValue: 125, positions: [p('stock'), p('option', { kind: 'option', marketValueUsd: 25, expiry: '2026-12-18', strike: 200, optionType: 'call' })] }] } });
  const config = { categories: DEFAULT_ASSET_CATEGORIES, assignments: { [stockCategoryKey('ibkr', 'stock')]: 'stocks' }, redirects: {}, defaultCategoryId: 'cash' };
  const model = buildTopHoldings(aggregateAssetCategories(assets, config), 1375);
  assert.equal(model.rows.length, 2);assert.equal(model.rows[0].label, 'NVDA');assert.equal(model.rows[0].value, 300);assert.match(model.rows[1].label, /200C/);
  assert.equal(model.totalAssetsValue, 1375);assert.equal(model.rows[0].share,300/1375*100);
});

test('allocation USD display rounds to whole dollars without changing calculation values or displaying negative zero', () => {
  assert.equal(formatAllocationUsd(1234.6), '$1,235');assert.equal(formatAllocationUsd(-1.5), '-$2');assert.equal(formatAllocationUsd(-.01), '$0');assert.equal(formatAllocationUsd(.5), '$1');
});


test('compact dot columns share a real monetary unit and retain fractional values without vertical growth', () => {
  for (const values of [[1200.6, 1000.6, -200, .01], [1e12, 1, .001], [0, NaN, Infinity], []]) {
    const { unit, fractions } = holdingDotScale(values);
    assert.ok(unit >= 1 && Number.isFinite(unit));
    fractions.forEach((dots, index) => {
      assert.ok(dots.length <= 10);
      assert.ok(dots.every(fraction => fraction > 0 && fraction <= 1));
      const expected = Number.isFinite(values[index]) ? Math.abs(values[index]) : 0;
      assert.ok(Math.abs(dots.reduce((sum, fraction) => sum + fraction, 0) * unit - expected) <= Math.max(1e-9, expected * 1e-12));
    });
  }
});
