import Decimal from 'decimal.js';
import type { DerivedTarget } from './derive';
import { derivePositionLimit } from './positionLimit';

// F7 Stacked Rungs: each normalized capacity ladder has 30 + 40 + 30 rungs.
// The two one-rung gaps between bands are visual separators, not extra capacity.
export const CAPACITY_SEGMENTS = [
  { start: 0, end: .3, size: .3, rungs: 30 },
  { start: .3, end: .7, size: .4, rungs: 40 },
  { start: .7, end: 1, size: .3, rungs: 30 },
] as const;
export const CAPACITY_BASE = 270, CAPACITY_STEP = 2, CAPACITY_HEIGHT = 378;
export function capacityY(progress: number, heightScale = 1) {
  const value = Math.max(0, Math.min(1, progress));
  return CAPACITY_BASE - (value * 100 + (value > .3 ? 1 : 0) + (value > .7 ? 1 : 0)) * CAPACITY_STEP * heightScale;
}

/** A shared log1p axis expands small allocations while retaining a true zero. */
export function buildCapacityAxis(limits: (number | null)[]) {
  const valid = limits.filter((value): value is number => value !== null && Number.isFinite(value) && value > 0 && value <= 1);
  const max = valid.reduce((largest, value) => Math.max(largest, value), 0);
  const constant = valid.reduce((smallest, value) => Math.min(smallest, value), max || 1);
  const extent = Math.log1p(max / constant);
  const height = CAPACITY_BASE - capacityY(1);
  const y = (share: number) => {
    const bounded = Number.isFinite(share) ? Math.max(0, Math.min(max, share)) : 0;
    return max === 0 ? CAPACITY_BASE : CAPACITY_BASE - Math.log1p(bounded / constant) / extent * height;
  };
  // Use familiar percentages, keeping labels far enough apart on the transformed axis.
  const candidates = new Set([0, max]);
  if (max > 0) {
    for (let exponent = Math.floor(Math.log10(constant)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
      for (const multiplier of [1, 2, 5]) {
        const value = Number((multiplier * 10 ** exponent).toPrecision(12));
        if (value > 0 && value < max) candidates.add(value);
      }
    }
  }
  const ticks = [{ value: 0, y: CAPACITY_BASE }];
  for (const value of [...candidates].sort((a, b) => a - b)) {
    if (value > 0 && value < max && ticks.at(-1)!.y - y(value) >= 27 && y(value) - y(max) >= 27) ticks.push({ value, y: y(value) });
  }
  if (max > 0) ticks.push({ value: max, y: y(max) });
  return { max, y, height, ticks };
}
const rnd = (index: number, seed: number) => Math.abs(((index * 73856093) ^ (seed * 19349663)) % 1000) / 1000;
export function buildStackedRungsModel(targets: DerivedTarget[], totalPortfolioUsd: number) {
  return targets.map(target => {
    const value = derivePositionLimit(target.currentValue, totalPortfolioUsd, target.target.positionLimitShare);
    const current = value.currentShare !== null && Number.isFinite(value.currentShare) ? value.currentShare : null;
    const limit = value.limitShare;
    const usage = current !== null && limit !== null ? new Decimal(current).div(limit).toNumber() : null;
    const progress = usage !== null && Number.isFinite(usage) ? Math.max(0, Math.min(1, usage)) : null;
    const seed = [...target.target.id].reduce((hash, char) => ((hash * 31 + char.charCodeAt(0)) >>> 0), 7);
    return { target, current, limit, usage, progress,
      gap: current !== null && limit !== null ? new Decimal(limit).minus(current).toNumber() : null,
      overLimit: usage !== null && usage > 1, belowZero: usage !== null && usage < 0,
      segments: CAPACITY_SEGMENTS,
      rungs: limit === null ? [] : CAPACITY_SEGMENTS.flatMap((segment, band) => Array.from({ length: segment.rungs }, (_, index) => {
        const unit = Math.round(segment.start * 100) + index;
        return { band, unit, y: CAPACITY_BASE - (unit + .5 + band) * CAPACITY_STEP,
          widthJitter: -1.4 + rnd(index + 1, seed + band + 2) * 2.8,
          opacity: .6 + rnd(index + 2, seed + band + 4) * .4,
          fraction: progress === null ? 0 : Decimal.max(0, Decimal.min(1, new Decimal(progress).mul(100).minus(unit))).toNumber() };
      })),
    };
  });
}
