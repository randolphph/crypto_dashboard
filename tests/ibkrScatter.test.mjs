import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { buildIbkrScatter, scatterScale, scatterWeightAxis, scatterReturnAxis, placeScatterLogos, SCATTER_LOGO_SIZE } = createTsLoader()('lib/portfolio/ibkrScatter.ts');
const position = (id, value, pnlPct, extra = {}) => ({ id, broker: 'ibkr', market: 'US', symbol: id,
  shares: 1, price: 100, marketValueUsd: value, pnlPct, kind: 'stock', ...extra });

test('IBKR coordinates use gross holding value, preserve shorts and option premium, and do not mutate data', () => {
  const positions = [position('NVDA', 6000, 20), position('MSFT', -2000, -10, { shares: -2 }),
    position('option', -1000, 40, { kind: 'option', symbol: 'NVDA261218P00180000', shares: -1, multiplier: 100 }),
    position('unknown-return', 1000, undefined), position('other-broker', 90000, 10, { broker: 'ths' })];
  const original = structuredClone(positions), model = buildIbkrScatter(positions);
  assert.equal(model.totalAbsoluteValue, 10000);
  assert.deepEqual(model.points.map(p => [p.position.id, p.weight, p.pnlPct]), [['NVDA', 60, 20], ['MSFT', 20, -10], ['option', 10, 40]]);
  assert.equal(model.points[2].label, 'NVDA 2026-12-18 180P');
  assert.deepEqual(model.omitted.map(p => p.id), ['unknown-return']);
  assert.equal(model.count, 4);
  assert.deepEqual(positions, original);
});

test('unknown quotes and returns stay out of the plot; known worthless positions can retain a real -100% return', () => {
  const model = buildIbkrScatter([position('good', 1000, 0), position('no-quote', 0, -100, { price: 0, priceStatus: 'error' }),
    position('worthless', 0, -100, { price: 0, priceStatus: 'closed' }), position('invalid', Infinity, 30),
    position('invalid-return', 1000, NaN), position('closed', 100, 2, { shares: 0 })]);
  assert.equal(model.totalAbsoluteValue, 2000);
  assert.deepEqual(model.points.map(p => [p.position.id, p.weight, p.pnlPct]), [['good', 50, 0], ['worthless', 0, -100]]);
  assert.equal(model.omitted.length, 3);
  assert.equal(buildIbkrScatter([]).points.length, 0);
  assert.equal(buildIbkrScatter([position('zero', 0, -100, { price: 0, priceStatus: 'ok' })]).points.length, 0);
});

test('scatter scales include zero, negative returns and outliers with finite increasing ticks', () => {
  for (const values of [[], [0], [-100, -10], [2, 3], [-100, 1000], [.001, .002]]) {
    const scale = scatterScale(values);
    assert.ok(scale.min <= Math.min(0, ...values));
    assert.ok(scale.max >= Math.max(0, ...values));
    assert.ok(scale.max > scale.min);
    assert.ok(scale.ticks.every(Number.isFinite));
    assert.ok(scale.ticks.every((tick, i) => i === 0 || tick > scale.ticks[i - 1]));
  }
});

test('small holdings use an adaptive axis without a ten-percent minimum', () => {
  const axis = scatterWeightAxis([.03, .06, .09]);
  assert.ok(axis.max < 1);
  assert.ok(axis.max >= .09);
  assert.equal(axis.position(0), 0);
  assert.equal(axis.position(axis.max), 1);
});

test('density weighting spreads tiny holdings while keeping every large holding on the same axis', () => {
  const weights = Array.from({ length: 24 }, (_, i) => .03 + i * .002);
  weights.push(.65, 98);
  const original = structuredClone(weights);
  const axis = scatterWeightAxis(weights), linear = scatterWeightAxis(weights, 'linear');
  assert.ok(axis.nonlinear);
  const spread = scale => scale.position(.076) - scale.position(.03);
  assert.ok(spread(axis) > spread(linear) * 10);
  for (const value of weights) {
    assert.ok(axis.position(value) >= 0 && axis.position(value) <= 1);
    assert.ok(Math.abs(axis.valueAt(axis.position(value)) - value) < 1e-8);
  }
  assert.deepEqual(weights, original);
});

test('nonlinear mapping stays continuous, strictly monotonic and invertible, including zero and duplicate values', () => {
  for (const weights of [[], [0], [0, 0, 0], [1, 1, 1], [0, .01, .01, .03, 99], [.000001, .000002, 100]]) {
    const axis = scatterWeightAxis(weights);
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const value = axis.max * i / 100, mapped = axis.position(value);
      assert.ok(Number.isFinite(mapped));
      assert.ok(mapped > previous);
      assert.ok(Math.abs(axis.valueAt(mapped) - value) < 1e-7);
      previous = mapped;
    }
    assert.ok(axis.ticks.every(tick => tick >= 0 && tick <= axis.max));
    assert.ok(axis.ticks.every((tick, i) => i === 0 || tick > axis.ticks[i - 1]));
  }
});

test('dense logo labels avoid one another and actual dots without changing the scatter coordinates', () => {
  const anchors = Array.from({ length: 18 }, (_, i) => ({ id: `point${i}`, x: 80 + i % 3 * 8, y: 220 + i % 2 * 3 }));
  anchors.push({ id: 'left', x: 48, y: 90 }, { id: 'right', x: 275, y: 90 });
  const original = structuredClone(anchors), placed = placeScatterLogos(anchors, 300), size = SCATTER_LOGO_SIZE;
  assert.equal(placed.size, anchors.length);
  const boxes = [...placed.values()];
  for (const [i, box] of boxes.entries()) {
    assert.ok(box.x >= 0 && box.x + size <= 300);
    assert.ok(box.y >= 26);
    assert.ok(boxes.every((other, j) => i === j || box.x + size <= other.x || box.x >= other.x + size || box.y + size <= other.y || box.y >= other.y + size));
    assert.ok(anchors.every(anchor => box.x + size <= anchor.x - 7 || box.x >= anchor.x + 7 || box.y + size <= anchor.y - 7 || box.y >= anchor.y + 7));
  }
  assert.deepEqual(anchors, original);
  assert.deepEqual(placeScatterLogos(anchors, 300), placed);
  assert.ok([...placeScatterLogos(anchors, 300, 42).values()].every(box => box.x >= 42));
});

test('the return axis expands ordinary gains and losses while retaining extreme option returns and a real zero', () => {
  const returns = Array.from({ length: 24 }, (_, i) => i - 12).concat([-1000, 9900]);
  const original = structuredClone(returns), density = scatterReturnAxis(returns), linear = scatterReturnAxis(returns, 'linear');
  assert.ok(density.nonlinear);
  assert.ok(density.position(10) - density.position(-10) > (linear.position(10) - linear.position(-10)) * 10);
  const zero = density.position(0);
  assert.ok(density.position(-1000) < zero && density.position(9900) > zero);
  for (const value of returns) {
    const ratio = density.position(value);
    assert.ok(ratio >= 0 && ratio <= 1);
    assert.ok(Math.abs(density.valueAt(ratio) - value) < 1e-8);
  }
  assert.ok(density.ticks.includes(0));
  assert.deepEqual(returns, original);
});

test('signed return scales remain finite and invertible for all-positive, all-negative, zero and duplicate returns', () => {
  for (const values of [[], [0], [-100], [-10, -10, -10], [-100, -50, -2], [2, 5, 20], [-.001, 0, .001, 100000]]) {
    for (const mode of ['density', 'linear']) {
      const axis = scatterReturnAxis(values, mode);
      let previous = -1;
      for (let i = 0; i <= 100; i++) {
        const value = axis.min + (axis.max - axis.min) * i / 100, ratio = axis.position(value);
        assert.ok(Number.isFinite(ratio) && ratio > previous);
        assert.ok(Math.abs(axis.valueAt(ratio) - value) < 1e-7);
        previous = ratio;
      }
      assert.ok(axis.min <= 0 && axis.max >= 0);
      assert.ok(axis.ticks.includes(0));
    }
  }
});
