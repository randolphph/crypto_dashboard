import type { FxRates, StockCurrency } from '@/types/stocks';

export interface Liability {
  id: string;
  name: string;
  amount: number;
  currency: StockCurrency;
  broker?: 'ths';
}

export function valueLiabilities(rows: Liability[], fx?: FxRates) {
  const items = rows.map((row) => {
    const rate = row.currency === 'USD' ? 1 : row.currency === 'CNY' ? fx?.cnyUsd : row.currency === 'HKD' ? fx?.hkdUsd : fx?.krwUsd;
    const amountUsd = row.amount === 0 ? 0 : rate !== undefined && Number.isFinite(rate) && rate > 0 ? row.amount * rate : undefined;
    return { ...row, broker: 'ths' as const, amountUsd };
  });
  const complete = items.every((row) => row.amountUsd !== undefined && Number.isFinite(row.amountUsd));
  return { items, complete, totalUsd: complete ? items.reduce((s, row) => s + row.amountUsd!, 0) : undefined };
}

export function portfolioNetValue(assetsUsd: number, liabilitiesUsd: number | undefined) {
  return liabilitiesUsd === undefined ? NaN : assetsUsd - liabilitiesUsd;
}

// Only the A-share source absorbs the debt. Summing these source values
// already gives portfolio equity; do not subtract liabilities a second time.
export function combineAShareLiabilities<T extends { label: string; value: number }>(rows: T[], aShareLabel: string, liabilitiesUsd: number | undefined): Array<T | { label: string; value: number }> {
  const index = rows.findIndex((row) => row.label === aShareLabel);
  const combined = rows.map((row, i) => i === index ? { ...row, value: portfolioNetValue(row.value, liabilitiesUsd) } : row);
  return index === -1 && liabilitiesUsd !== 0 ? [...combined, { label: aShareLabel, value: portfolioNetValue(0, liabilitiesUsd) }] : combined;
}
