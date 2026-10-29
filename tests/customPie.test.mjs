import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { buildCustomPieSlices } = createTsLoader()('lib/portfolio/customPie.ts');

test('custom pie angles preserve exact shares including tiny holdings', () => {
  const input = [{ label: 'tiny', value: 1 }, { label: 'cash', value: 60000 }, { label: 'other', value: 39999 }];
  const slices = buildCustomPieSlices(input);
  assert.deepEqual(slices.map(slice => slice.label), ['cash', 'other', 'tiny']);
  for (const slice of slices) {
    assert.ok(Math.abs((slice.endAngle - slice.startAngle) / (2 * Math.PI) - slice.value / 100000) < 1e-14);
  }
  assert.equal(slices[0].startAngle, -Math.PI / 2);
  assert.equal(slices.at(-1).endAngle, 1.5 * Math.PI);
  assert.equal(slices.at(-1).share, 0.00001);
  assert.deepEqual(input.map(item => item.label), ['tiny', 'cash', 'other']);
});

test('custom pie radii follow real category values without fabricated metrics', () => {
  const slices = buildCustomPieSlices([{ label: 'a', value: 100 }, { label: 'b', value: 25 }, { label: 'c', value: 1 }]);
  assert.deepEqual(slices.map(slice => slice.radiusRatio), [1, 0.5, 0.1]);
});

test('custom pie excludes liabilities and invalid amounts and handles a single category', () => {
  const slices = buildCustomPieSlices([{ label: 'a', value: 100 }, ...[0, -200, NaN, Infinity].map(value => ({ label: 'invalid', value }))]);
  assert.equal(slices.length, 1);
  assert.equal(slices[0].share, 1);
  assert.equal(slices[0].endAngle - slices[0].startAngle, 2 * Math.PI);
  assert.deepEqual(buildCustomPieSlices([]), []);
  assert.deepEqual(buildCustomPieSlices([{ label: 'negative', value: -1 }]), []);
});
