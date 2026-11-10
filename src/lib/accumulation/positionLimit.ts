import Decimal from 'decimal.js';

/** Limits are fractions of the entire portfolio, independent of the AI target. */
export function validatePositionLimitShare(value: unknown): asserts value is number | undefined {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1)) {
    throw new Error('仓位上限需大于 0% 且不超过 100%');
  }
}

export function parsePositionLimitPercent(draft: string): number | undefined {
  if (!draft.trim()) return undefined;
  const share = Number(draft) / 100;
  validatePositionLimitShare(share);
  return share;
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
