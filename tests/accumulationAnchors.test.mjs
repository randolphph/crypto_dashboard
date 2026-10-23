import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { deriveTargets } = createTsLoader()('lib/accumulation/derive.ts');
const target = { id: 'nvda', symbol: 'NVDA', market: 'US', sector: 'AI', ma20: 200,
  tierOffsets: [-0.03, -0.06, -0.1], status: 'active' };
const gate = { open: true, sectors: {}, version: 0 };
const derive = (updates = {}, ma20) => deriveTargets([{ ...target, ...updates }], undefined, gate,
  [{ symbol: 'NVDA', market: 'US', price: 190 }], ma20 ? { 'US:NVDA': ma20 } : {})[0];
const prices = row => row.tiers.map(t => t.price);

test('existing automatic plans continue following live MA20', () => {
  assert.deepEqual(prices(derive()), [194, 188, 180]);
  assert.deepEqual(prices(derive({}, 100)), [97, 94, 90]);
});

test('all manual anchor prices stay fixed across MA20 updates and drive trigger detection', () => {
  const updates = { tierPrices: [191.125, 185.5, 175.01] };
  for (const ma20 of [100, 300]) {
    const row = derive(updates, ma20);
    assert.deepEqual(prices(row), updates.tierPrices);
    assert.deepEqual(row.tiers.map(t => t.triggered), [true, false, false]);
    assert.equal(row.flagged, true);
    assert.equal(row.tiers[0].gapPct, (190 - 191.125) / 191.125);
  }
});

test('individual resets restore formulas while preserving other manual anchors', () => {
  const updates = { relRatios: [0.1, 0.2], tierPrices: [150, null, 100] };
  assert.deepEqual(prices(derive(updates, 300)), [150, 135, 100]);
  assert.deepEqual(prices(derive({ ...updates, tierPrices: [null, null, 100] }, 100)), [97, 87.3, 100]);
  assert.deepEqual(prices(derive({ ...updates, tierPrices: [150, null, null] }, 300)), [150, 135, 120]);
});

test('invalid saved manual values fall back to automatic prices safely', () => {
  for (const tierPrices of [[0, -1, NaN], [Infinity, '10', undefined]]) {
    assert.deepEqual(prices(derive({ tierPrices })), [194, 188, 180]);
  }
});
