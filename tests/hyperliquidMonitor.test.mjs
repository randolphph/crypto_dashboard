import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { diffHyperliquidSnapshots } = createTsLoader()('lib/hyperliquid/events.ts');
const order = { oid: '123', coin: 'BTC', side: 'buy', price: '60000', remainingSize: '1', originalSize: '1', cloid: null, reduceOnly: false, orderType: 'Limit', tif: 'Gtc', isTrigger: false, isPositionTpsl: false, triggerPrice: null, triggerCondition: null, timestampMs: 1000 };
const snapshot = (orders) => ({ address: '0xabc', network: 'mainnet', fetchedAt: 1000, positions: [], orders });
const fill = { id: '123:456', oid: '123', coin: 'BTC', side: 'buy', price: '60000', size: '0.4', time: 2000 };
const { parseCopySettings } = createTsLoader()('lib/hyperliquid/settings.ts');

test('restores valid copy settings and rejects corrupted or invalid saved values', () => {
  assert.deepEqual(parseCopySettings('{"ratio":"0.25","maxSlippagePercent":"1.2"}'), { ratio: '0.25', maxSlippagePercent: '1.2' });
  for (const raw of [null, 'invalid', '{"ratio":"-1","maxSlippagePercent":"6"}', '{"ratio":2,"maxSlippagePercent":"NaN"}']) {
    assert.deepEqual(parseCopySettings(raw), { ratio: '0.1', maxSlippagePercent: '0.5' });
  }
  assert.equal(parseCopySettings('{"maxSlippagePercent":"0"}').maxSlippagePercent, '0');
});

test('records new and changed orders with both values', () => {
  assert.equal(diffHyperliquidSnapshots(snapshot([]), snapshot([order]))[0].kind, 'order_appeared');
  const [change] = diffHyperliquidSnapshots(snapshot([order]), snapshot([{ ...order, price: '61000' }]));
  assert.equal(change.kind, 'order_changed');
  assert.equal(change.before.price, '60000');
  assert.equal(change.after.price, '61000');
});

test('confirms disappearance from exchange status without guessing', () => {
  for (const [status, kind] of [['filled', 'order_filled'], ['canceled', 'order_canceled'], ['marginCanceled', 'order_canceled'], ['rejected', 'order_rejected'], ['unknown', 'order_disappeared']]) {
    const events = diffHyperliquidSnapshots(snapshot([order]), snapshot([]), [], new Map([['123', status]]));
    assert.equal(events[0].kind, kind);
  }
});

test('records partial fills without a duplicate quantity-only order change', () => {
  const events = diffHyperliquidSnapshots(snapshot([order]), snapshot([{ ...order, remainingSize: '0.6' }]), [fill]);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'order_partially_filled');
  assert.equal(events[0].fill.size, '0.4');
  assert.equal(events[0].id, 'fill-123:456');
});

test('preserves partial fill then cancellation as separate operations', () => {
  const events = diffHyperliquidSnapshots(snapshot([order]), snapshot([]), [fill], new Map([['123', 'canceled']]));
  assert.deepEqual(events.map((e) => e.kind).sort(), ['order_canceled', 'order_partially_filled']);
});

test('records fills of orders that opened and filled between polls', () => {
  const events = diffHyperliquidSnapshots(snapshot([]), snapshot([]), [fill]);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'order_fill');
  assert.equal(events[0].sourceOid, '123');
});

test('full fill produces one confirmed event with actual fill details', () => {
  const events = diffHyperliquidSnapshots(snapshot([order]), snapshot([]), [{ ...fill, size: '1' }], new Map([['123', 'filled']]));
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'order_filled');
  assert.equal(events[0].fill.size, '1');
});
