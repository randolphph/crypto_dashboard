import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const load = createTsLoader();
const { deriveTargets } = load('lib/accumulation/derive.ts');
const { sortTargets } = load('lib/accumulation/sort.ts');
const gate = { open: false, sectors: {}, version: 0 };
const target = { id: 'nvda', symbol: 'NVDA', market: 'US', sector: 'AI', ma20: 200,
  tierOffsets: [-0.03, -0.06, -0.1], status: 'active' };
const holding = (overrides = {}) => ({ id: 'stock', symbol: 'NVDA', market: 'US', kind: 'stock',
  shares: 2, costBasis: 100, price: 200, marketValueUsd: 400, pnlUsd: 200,
  priceUpdatedAt: '2026-10-19T12:00:00Z', priceSource: 'shared-quotes', priceStatus: 'ok', ...overrides });
const derive = (positions, quotes = []) => deriveTargets([target], { brokers: [{ positions }] }, gate, quotes)[0];

test('AI costs weight every account by quantity and retain the dashboard quote and broker PnL', () => {
  const row = derive([holding(), holding({ id: 'other-account', shares: 3, costBasis: 150,
    marketValueUsd: 600, pnlUsd: 125 })]);
  assert.equal(row.costBasisLocal, 130);
  assert.equal(row.livePrice, 200);
  assert.equal(row.priceUpdatedAt, '2026-10-19T12:00:00Z');
  assert.equal(row.priceSource, 'shared-quotes');
  assert.equal(row.pnlUsd, 325); // Preserve broker accounting instead of recalculating.
});

test('zero costs remain valid, while incomplete costs and PnL are not presented as a complete position', () => {
  assert.equal(derive([holding({ costBasis: 0 })]).costBasisLocal, 0);
  const row = derive([holding(), holding({ id: 'unknown', costBasis: undefined, pnlUsd: undefined })]);
  assert.equal(row.costBasisLocal, null);
  assert.equal(row.pnlUsd, null);
  assert.equal(row.pnlPct, null);
  assert.equal(derive([holding({ costBasis: -10 })]).costBasisLocal, null);
});

test('an option with a larger valuation cannot replace the underlying stock price or per-share cost', () => {
  const row = derive([holding(), holding({ id: 'option', kind: 'option', price: 12,
    marketValueUsd: 12000, costBasis: 10, priceSource: 'option-mark' })]);
  assert.equal(row.livePrice, 200);
  assert.equal(row.costBasisLocal, 100);
  assert.equal(row.priceSource, 'shared-quotes');
});

test('option-only holdings use the shared underlying watch quote and have no invented stock cost', () => {
  const row = derive([holding({ kind: 'option', price: 12, costBasis: 10 })], [
    { symbol: 'NVDA', market: 'US', price: 210, priceSource: 'shared-watch', priceUpdatedAt: '2026-10-19T12:00:01Z' },
  ]);
  assert.equal(row.livePrice, 210);
  assert.equal(row.priceSource, 'shared-watch');
  assert.equal(row.costBasisLocal, null);
});

test('unavailable underlying prices stay unavailable instead of falling back to an option mark', () => {
  assert.equal(derive([holding({ kind: 'option' })]).livePrice, null);
  const row = derive([holding({ price: 0 })], [
    { symbol: 'NVDA', market: 'US', price: 210, priceSource: 'shared-watch', priceUpdatedAt: '2026-10-19T12:01:00Z' },
  ]);
  assert.equal(row.livePrice, 210);
  assert.equal(row.priceUpdatedAt, '2026-10-19T12:01:00Z');
});

test('profit and loss sorting ranks losses, zero and gains correctly and always keeps unknown PnL last', () => {
  const row = derive([holding()]);
  const rows = [['unknown', null], ['gain', 100], ['loss', -50], ['zero', 0]].map(([symbol, pnlUsd]) => (
    { ...row, target: { ...target, symbol }, pnlUsd }
  ));
  assert.deepEqual(sortTargets(rows, 'pnlUsd', false).map(r => r.target.symbol), ['gain', 'zero', 'loss', 'unknown']);
  assert.deepEqual(sortTargets(rows, 'pnlUsd', true).map(r => r.target.symbol), ['loss', 'zero', 'gain', 'unknown']);
  assert.deepEqual(rows.map(r => r.target.symbol), ['unknown', 'gain', 'loss', 'zero']);
  rows[2].target = { ...rows[2].target, sector: 'selected' };
  assert.equal(sortTargets(rows, 'pnlUsd', false, 'selected')[0].target.symbol, 'loss');
});
