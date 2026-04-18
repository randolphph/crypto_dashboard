'use client';

import { formatUsd } from '@/lib/format';

interface PortfolioSummaryProps {
  totalValue: number;
  breakdown: { label: string; value: number }[];
  isLoading: boolean;
}

const COLORS = [
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
];

function PieChart({
  breakdown,
  totalValue,
}: {
  breakdown: { label: string; value: number }[];
  totalValue: number;
}) {
  const items = breakdown.filter((b) => b.value > 0);
  if (items.length === 0 || totalValue <= 0) return null;

  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 56;

  let cumulative = 0;
  const slices = items.map((item, i) => {
    const fraction = item.value / totalValue;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;

    // For a single 100% slice, draw a full circle
    if (fraction >= 0.9999) {
      return (
        <circle key={item.label} cx={cx} cy={cy} r={r} fill={COLORS[i % COLORS.length]} />
      );
    }

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return <path key={item.label} d={d} fill={COLORS[i % COLORS.length]} />;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices}
      </svg>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium tabular-nums">
              {((item.value / totalValue) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortfolioSummary({
  totalValue,
  breakdown,
  isLoading,
}: PortfolioSummaryProps) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        {/* Left: total value + breakdown */}
        <div>
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
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: pie chart */}
        {!isLoading && breakdown.length > 0 && (
          <PieChart breakdown={breakdown} totalValue={totalValue} />
        )}
      </div>
    </div>
  );
}
