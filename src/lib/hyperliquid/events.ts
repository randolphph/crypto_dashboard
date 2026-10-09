import type {
  HyperliquidFill,
  HyperliquidMonitorEvent,
  HyperliquidOrder,
  HyperliquidPosition,
  HyperliquidSnapshot,
} from '@/types/hyperliquid';

function decimalParts(value: string) {
  const normalized = value.replace(/^[+-]/, '');
  const [integer = '0', fraction = ''] = normalized.split('.');
  return {
    integer: integer.replace(/^0+(?=\d)/, ''),
    fraction: fraction.replace(/0+$/, ''),
  };
}

function compareAbsoluteDecimal(left: string, right: string) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (a.integer.length !== b.integer.length) return a.integer.length > b.integer.length ? 1 : -1;
  if (a.integer !== b.integer) return a.integer > b.integer ? 1 : -1;
  const length = Math.max(a.fraction.length, b.fraction.length);
  const af = a.fraction.padEnd(length, '0');
  const bf = b.fraction.padEnd(length, '0');
  return af === bf ? 0 : af > bf ? 1 : -1;
}

function sign(value: string) {
  return value.startsWith('-') ? -1 : 1;
}

function event(
  kind: HyperliquidMonitorEvent['kind'],
  coin: string,
  before: HyperliquidPosition | HyperliquidOrder | null,
  after: HyperliquidPosition | HyperliquidOrder | null,
  sourceOid: string | null = null,
): HyperliquidMonitorEvent {
  const observedAt = Date.now();
  return {
    id: `${observedAt}-${kind}-${coin}-${sourceOid ?? 'position'}`,
    observedAt,
    kind,
    coin,
    sourceOid,
    before,
    after,
  };
}

function positionEvents(
  previous: HyperliquidPosition[],
  current: HyperliquidPosition[],
) {
  const events: HyperliquidMonitorEvent[] = [];
  const before = new Map(previous.map((position) => [position.coin, position]));
  const after = new Map(current.map((position) => [position.coin, position]));
  for (const [coin, position] of after) {
    const prior = before.get(coin);
    if (!prior) {
      events.push(event('position_opened', coin, null, position));
      continue;
    }
    if (sign(prior.size) !== sign(position.size)) {
      events.push(event('position_reversed', coin, prior, position));
      continue;
    }
    const sizeChange = compareAbsoluteDecimal(position.size, prior.size);
    if (sizeChange > 0) events.push(event('position_increased', coin, prior, position));
    else if (sizeChange < 0) events.push(event('position_reduced', coin, prior, position));
    else if (
      prior.entryPrice !== position.entryPrice ||
      prior.leverage !== position.leverage ||
      prior.marginMode !== position.marginMode
    ) events.push(event('position_settings_changed', coin, prior, position));
  }
  for (const [coin, position] of before) {
    if (!after.has(coin)) events.push(event('position_closed', coin, position, null));
  }
  return events;
}

function orderEvents(
  previous: HyperliquidOrder[],
  current: HyperliquidOrder[],
  fills: HyperliquidFill[],
  statuses: ReadonlyMap<string, string>,
) {
  const events: HyperliquidMonitorEvent[] = [];
  const before = new Map(previous.map((order) => [order.oid, order]));
  const after = new Map(current.map((order) => [order.oid, order]));
  const filledOids = new Set(fills.map((fill) => fill.oid));
  for (const [oid, order] of after) {
    const prior = before.get(oid);
    if (!prior) events.push(event('order_appeared', order.coin, null, order, oid));
    else if (JSON.stringify(prior) !== JSON.stringify(order)) {
      // Quantity-only updates already have an actual execution record.
      if (!filledOids.has(oid) || JSON.stringify({ ...prior, remainingSize: order.remainingSize }) !== JSON.stringify(order)) {
        events.push(event('order_changed', order.coin, prior, order, oid));
      }
    }
  }
  for (const [oid, order] of before) {
    if (!after.has(oid)) {
      const status = statuses.get(oid);
      if (status === 'filled' && filledOids.has(oid)) continue;
      const kind = status === 'filled' ? 'order_filled'
        : status?.toLowerCase().endsWith('canceled') ? 'order_canceled'
          : status?.toLowerCase().endsWith('rejected') ? 'order_rejected' : 'order_disappeared';
      events.push({ ...event(kind, order.coin, order, null, oid), orderStatus: status });
    }
  }
  for (const fill of fills) {
    const status = statuses.get(fill.oid);
    const kind = after.has(fill.oid) || status?.toLowerCase().endsWith('canceled') ? 'order_partially_filled'
      : status === 'filled' ? 'order_filled' : 'order_fill';
    events.push({
      ...event(kind, fill.coin, before.get(fill.oid) ?? null, after.get(fill.oid) ?? null, fill.oid),
      id: `fill-${fill.id}`,
      observedAt: fill.time,
      fill,
      orderStatus: status,
    });
  }
  return events;
}

export function diffHyperliquidSnapshots(
  previous: HyperliquidSnapshot,
  current: HyperliquidSnapshot,
  fills: HyperliquidFill[] = [],
  statuses: ReadonlyMap<string, string> = new Map(),
) {
  return [
    ...positionEvents(previous.positions, current.positions),
    ...orderEvents(previous.orders, current.orders, fills, statuses),
  ].sort((a, b) => b.observedAt - a.observedAt);
}
