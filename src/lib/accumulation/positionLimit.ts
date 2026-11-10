import Decimal from 'decimal.js';
import type { AccumulationTarget } from '@/types/accumulation';

/** Both per-asset allocations and the AI budget are fractions of total assets. */
export function validatePositionLimitShare(value: unknown): asserts value is number | undefined {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1)) {
    throw new Error('仓位上限需大于 0% 且不超过 100%');
  }
}

export function parsePositionLimitPercent(draft: string): number | undefined {
  if (!draft.trim()) return undefined;
  const share = new Decimal(Number(draft)).div(100).toNumber();
  validatePositionLimitShare(share);
  return share;
}

type PlannedLimit = Pick<AccumulationTarget, 'positionLimitShare'>;
const plannedSum = (targets: PlannedLimit[]) => targets.reduce((sum, target) => {
  validatePositionLimitShare(target.positionLimitShare);
  return sum.plus(target.positionLimitShare ?? 0);
}, new Decimal(0));
const pct = (share: number) => share.toLocaleString('zh-CN', { style: 'percent', maximumSignificantDigits: 6 });

export function getPositionBudget(targets: PlannedLimit[], targetPortfolioShare: number) {
  const allocated = plannedSum(targets), remaining = new Decimal(targetPortfolioShare).minus(allocated);
  return { allocatedShare: allocated.toNumber(), remainingShare: Decimal.max(0, remaining).toNumber(),
    excessShare: Decimal.max(0, remaining.negated()).toNumber(), overBudget: remaining.isNegative() };
}

// Previous targets are supplied only for interactive edits. Old overallocated
// plans may be repaired gradually, but cannot increase their allocation. New
// imports and total-budget changes always require a valid complete allocation.
export function assertPositionBudget(targets: PlannedLimit[], targetPortfolioShare: number, previousTargets?: PlannedLimit[]) {
  if (!Number.isFinite(targetPortfolioShare) || targetPortfolioShare < 0 || targetPortfolioShare > 1) throw new Error('AI 总仓位需在 0% 到 100% 之间');
  const allocated = plannedSum(targets);
  if (allocated.lte(targetPortfolioShare)) return;
  if (previousTargets) {
    const previous = plannedSum(previousTargets);
    if (previous.gt(targetPortfolioShare) && allocated.lte(previous)) return;
  }
  throw new Error(`标的上限合计 ${pct(allocated.toNumber())}，超过 AI 总仓位 ${pct(targetPortfolioShare)}，请调低分配比例`);
}

export function derivePositionLimit(currentValue: number, totalPortfolioUsd: number, limitShare?: number) {
  const currentShare = Number.isFinite(currentValue) && Number.isFinite(totalPortfolioUsd) && totalPortfolioUsd > 0
    ? new Decimal(currentValue).div(totalPortfolioUsd).toNumber() : null;
  const limit = typeof limitShare === 'number' && Number.isFinite(limitShare) && limitShare > 0 && limitShare <= 1 ? limitShare : null;
  const usage = currentShare !== null && Number.isFinite(currentShare) && limit !== null ? new Decimal(Math.max(0, currentShare)).div(limit).toNumber() : null;
  return {
    currentShare, limitShare: limit, usage,
    progress: usage !== null ? Math.min(1, usage) : null,
    band: usage === null ? null : usage <= .3 ? 'low' as const : usage <= .7 ? 'medium' as const : 'high' as const,
  };
}
