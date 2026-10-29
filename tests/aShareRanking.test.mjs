import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { buildAShareRanking } = createTsLoader()('lib/portfolio/aShareRanking.ts');
const position = (id, marketValue, extra = {}) => ({ id, symbol: id, broker: 'ths', market: 'A', currency: 'CNY',
  kind: 'stock', shares: 100, price: 10, marketValue, ...extra });

test('A-share rows rank real CNY market values without changing source data or depending on costs', () => {
  const positions = [position('small', 3000), position('largest', 25000), position('middle', 12345.67, { costBasis: undefined })];
  const original = structuredClone(positions), model = buildAShareRanking(positions);
  assert.deepEqual(model.rows.map(row => row.position.id), ['largest', 'middle', 'small']);
  assert.equal(model.total, 40345.67);
  assert.ok(Math.abs(model.rows.reduce((sum, row) => sum + row.share, 0) - 100) < 1e-10);
  for (const row of model.rows) assert.ok(Math.abs(row.ticks.reduce((sum, fraction) => sum + fraction, 0) * model.unit - row.position.marketValue) < 1e-8);
  assert.deepEqual(positions, original);
});

test('fractional ticks preserve tiny holdings and a common unit across many rows', () => {
  const positions = Array.from({ length: 35 }, (_, i) => position(`stock${i}`, i * 123.45 + .01));
  const model = buildAShareRanking(positions);
  assert.equal(model.rows.length, 35);
  assert.ok(model.slots <= 40);
  assert.ok(model.rows.every(row => row.ticks.every(fraction => fraction > 0 && fraction <= 1)));
  const tiny = model.rows.find(row => row.position.id === 'stock0');
  assert.ok(tiny.ticks[0] < 1);
  assert.equal(tiny.ticks[0] * model.unit, .01);
  assert.ok(buildAShareRanking([position('only-cent', .01)]).unit >= .01);
});

test('invalid or negative values stay in details, while known zero values are not confused with missing quotes', () => {
  const model = buildAShareRanking([position('good', 1000), position('zero', 0, { price: 0, priceStatus: 'closed' }),
    position('missing', 0, { price: 0, priceStatus: 'error' }), position('negative', -100), position('invalid', NaN),
    position('wrong-currency', 500, { market: 'US', currency: 'USD' }), position('closed', 100, { shares: 0 }),
    position('other-broker', 9999, { broker: 'ibkr' })]);
  assert.deepEqual(model.rows.map(row => row.position.id), ['good', 'zero']);
  assert.equal(model.rows[1].ticks.length, 0);
  assert.equal(model.omitted.length, 4);
  assert.equal(buildAShareRanking([]).rows.length, 0);
});
