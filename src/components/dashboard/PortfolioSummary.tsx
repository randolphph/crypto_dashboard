'use client';

import { formatUsd } from '@/lib/format';

interface PortfolioSummaryProps {
  totalValue: number;
  breakdown: { label: string; value: number }[];
  isLoading: boolean;
}

export function PortfolioSummary({
  totalValue,
  breakdown,
  isLoading,
}: PortfolioSummaryProps) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">总资产价值</p>
        {isLoading ? (
          <div className="h-9 w-48 animate-pulse rounded bg-muted" />
        ) : (
          <p className="text-3xl font-bold tracking-tight">
            {formatUsd(totalValue)}
          </p>
        )}
      </div>
      {breakdown.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4">
          {breakdown.map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-sm font-medium">{formatUsd(item.value)}</p>
              {totalValue > 0 && (
                <p className="text-xs text-muted-foreground">
                  {((item.value / totalValue) * 100).toFixed(1)}%
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
