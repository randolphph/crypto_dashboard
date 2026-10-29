import type { EnrichedPosition } from '@/types/stocks';
import { optionContract } from '@/lib/stocks/optionContract';

export interface IbkrScatterPoint {
  position: EnrichedPosition;
  label: string;
  weight: number;
  pnlPct: number;
}

export function ibkrPositionLabel(position: EnrichedPosition) {
  if (position.kind !== 'option') return position.symbol;
  const contract = optionContract(position);
  const type = contract.optionType === 'call' ? 'C' : contract.optionType === 'put' ? 'P' : '';
  return [contract.underlying ?? position.symbol, contract.expiry,
    contract.strike === undefined ? type === 'C' ? 'Call' : type === 'P' ? 'Put' : undefined : `${contract.strike}${type}`,
    !contract.optionType ? '期权' : undefined].filter(Boolean).join(' ');
}

export function buildIbkrScatter(positions: EnrichedPosition[]) {
  const holdings = positions.filter(p => p.broker === 'ibkr' && Number.isFinite(p.shares) && p.shares !== 0);
  const valued = holdings.filter(p => Number.isFinite(p.marketValueUsd) && Number.isFinite(p.price)
    && (p.price > 0 || p.price === 0 && (p.priceStatus === 'ok' || p.priceStatus === 'closed')));
  // Include valued holdings missing a return in the denominator. Short legs use
  // absolute market value; option premiums never become underlying notionals.
  const totalAbsoluteValue = valued.reduce((sum, p) => sum + Math.abs(p.marketValueUsd), 0);
  const points: IbkrScatterPoint[] = valued.filter(p => Number.isFinite(p.pnlPct) && totalAbsoluteValue > 0 && Number.isFinite(totalAbsoluteValue))
    .map(position => ({ position, label: ibkrPositionLabel(position),
      weight: Math.abs(position.marketValueUsd) / totalAbsoluteValue * 100, pnlPct: position.pnlPct! }))
    .sort((a, b) => b.weight - a.weight || a.position.id.localeCompare(b.position.id));
  const plotted = new Set(points.map(point => point.position.id));
  return { points, totalAbsoluteValue, omitted: holdings.filter(p => !plotted.has(p.id)), count: holdings.length };
}

// Linear, zero-inclusive scales: losses and shorts never move to a fabricated
// zero return, and outliers remain at their real coordinates.
export function scatterScale(values: number[], minimumSpan = 10) {
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = Math.max(high - low, minimumSpan);
  const roughStep = span * 1.16 / 4;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= roughStep)!;
  const min = Math.floor((low < 0 ? low - span * .08 : 0) / step) * step;
  const max = Math.ceil((high > 0 ? high + span * .08 : minimumSpan) / step) * step;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => Number((min + i * step).toPrecision(12)));
  return { min, max, ticks };
}

function weightScale(weights: number[]) {
  const maximum = Math.max(0, ...weights);
  // A 0.3% holding should use the available space, not a fixed 10% floor.
  const scale = scatterScale([maximum], maximum || 1);
  const max = Math.min(100, scale.max);
  return { min: 0, max, ticks: Array.from({ length: 5 }, (_, i) => max * i / 4) };
}

export type ScatterAxisMode = 'density' | 'linear';

interface ScatterAnchor { id: string; x: number; y: number }
export const SCATTER_LOGO_SIZE = 20;

/** Move only the labels when crowded; the underlying scatter coordinates stay exact. */
export function placeScatterLogos(anchors: ScatterAnchor[], width: number, leftInset = 4) {
  const size = SCATTER_LOGO_SIZE, gap = 3, step = size + gap, minTop = 26;
  const placements = new Map<string, { x: number; y: number }>();
  const occupied: { x: number; y: number; width: number; height: number }[] = anchors.map(p => ({ x: p.x - 7, y: p.y - 7, width: 14, height: 14 }));
  for (const anchor of [...anchors].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))) {
    const initial = { x: Math.max(leftInset, Math.min(width - size - 4, anchor.x - size / 2)), y: Math.max(minTop, anchor.y - size - 11) };
    const candidates = [];
    for (let lift = 0; initial.y - lift >= minTop; lift += step) {
      for (let column = -Math.ceil(width / step); column <= Math.ceil(width / step); column++) {
        const x = initial.x + column * step;
        if (x >= leftInset && x + size <= width - 4) candidates.push({ x, y: initial.y - lift, score: Math.abs(column * step) * 1.5 + lift });
      }
    }
    candidates.sort((a, b) => a.score - b.score || a.x - b.x);
    const chosen = candidates.find(candidate => occupied.every(rect => candidate.x + size + gap <= rect.x || candidate.x >= rect.x + rect.width + gap
      || candidate.y + size + gap <= rect.y || candidate.y >= rect.y + rect.height + gap)) ?? initial;
    placements.set(anchor.id, { x: chosen.x, y: chosen.y });
    occupied.push({ x: chosen.x, y: chosen.y, width: size, height: size });
  }
  return placements;
}

function densityAxis(values: number[], scale: ReturnType<typeof scatterScale>, mode: ScatterAxisMode) {
  const sorted = values.filter(value => Number.isFinite(value) && value > scale.min && value < scale.max).sort((a, b) => a - b);
  const unique = [...new Set(sorted)];
  const span = scale.max - scale.min;
  const nonlinear = mode === 'density' && unique.length > 1;
  const knots = [{ value: scale.min, ratio: 0 }];
  // Blend empirical mid-ranks with a linear floor. Dense intervals receive
  // more space, while sparse intervals remain strictly increasing. Equal
  // weights share one coordinate; neither holdings nor returns are jittered.
  let start = 0;
  for (const value of unique) {
    let end = start + 1;
    while (end < sorted.length && sorted[end] === value) end++;
    const ratio = .8 * ((start + end) / 2 / sorted.length) + .2 * (value - scale.min) / span;
    knots.push({ value, ratio });
    start = end;
  }
  if (knots.at(-1)!.value !== scale.max) knots.push({ value: scale.max, ratio: 1 });
  const position = (value: number) => {
    const clipped = Math.max(scale.min, Math.min(scale.max, value));
    if (!nonlinear) return (clipped - scale.min) / span;
    const upper = knots.findIndex(knot => knot.value >= clipped);
    if (upper <= 0) return 0;
    const a = knots[upper - 1], b = knots[upper];
    return a.ratio + (clipped - a.value) / (b.value - a.value) * (b.ratio - a.ratio);
  };
  const valueAt = (ratio: number) => {
    const clipped = Math.max(0, Math.min(1, ratio));
    if (!nonlinear) return scale.min + clipped * span;
    const upper = knots.findIndex(knot => knot.ratio >= clipped);
    if (upper <= 0) return scale.min;
    const a = knots[upper - 1], b = knots[upper];
    return a.value + (clipped - a.ratio) / (b.ratio - a.ratio) * (b.value - a.value);
  };
  const candidates = new Set([scale.min, 0, scale.max, ...scale.ticks]);
  if (nonlinear) {
    for (const value of unique) candidates.add(Number(value.toPrecision(2)));
    const magnitudes = unique.map(Math.abs).filter(value => value > 0);
    const largest = Math.max(Math.abs(scale.min), Math.abs(scale.max));
    const smallest = Math.min(...magnitudes, largest);
    for (let power = Math.floor(Math.log10(smallest)) - 1; power <= Math.ceil(Math.log10(largest)); power++) {
      for (const factor of [1, 2, 3, 5]) for (const sign of [-1, 1]) candidates.add(sign * factor * 10 ** power);
    }
  }
  const ticks = [...candidates].filter(value => value >= scale.min && value <= scale.max).sort((a, b) => a - b);
  return { min: scale.min, max: scale.max, nonlinear, position, valueAt, ticks };
}

export function scatterWeightAxis(weights: number[], mode: ScatterAxisMode = 'density') {
  const values = weights.filter(value => Number.isFinite(value) && value >= 0);
  return densityAxis(values, weightScale(values), mode);
}

export function scatterReturnAxis(returns: number[], mode: ScatterAxisMode = 'density') {
  const values = returns.filter(Number.isFinite);
  return densityAxis(values, scatterScale(values), mode);
}
