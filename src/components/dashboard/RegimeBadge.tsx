'use client';

import { TrendingDown, Wallet, Flame, Sprout } from 'lucide-react';
import { useRegime, type RegimeLabel } from '@/hooks/useRegime';

const REGIME_META: Record<
  RegimeLabel,
  { label: string; sub: string; color: string; icon: typeof Wallet }
> = {
  'bear-bottom': {
    label: '熊市底部',
    sub: '历史性低估区',
    color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30',
    icon: Sprout,
  },
  accumulation: {
    label: '积累期',
    sub: '中性偏左侧',
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    icon: Wallet,
  },
  'bull-run': {
    label: '牛市主升',
    sub: '趋势确立',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
    icon: TrendingDown,
  },
  euphoria: {
    label: '狂热顶部',
    sub: '历史性高估区',
    color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
    icon: Flame,
  },
};

function StatPill({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: 'low' | 'high' | null;
}) {
  const color =
    warn === 'low'
      ? 'text-blue-600 dark:text-blue-400'
      : warn === 'high'
        ? 'text-red-600 dark:text-red-400'
        : 'text-foreground';
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

export function RegimeBadge() {
  const { data, isLoading, isError } = useRegime();

  // Fail quietly — this is supplementary signal, not core data
  if (isError) return null;

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-3 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const meta = REGIME_META[data.regime];
  const Icon = meta.icon;

  const mayerWarn =
    data.mayer > 2.4 ? 'high' : data.mayer < 1 ? 'low' : null;
  const fgWarn =
    data.fearGreed > 85 ? 'high' : data.fearGreed < 20 ? 'low' : null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${meta.color}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">市场阶段</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded border tabular-nums ${meta.color}`}
            >
              {meta.label}
            </span>
            <span className="text-[11px] text-muted-foreground">{meta.sub}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            <StatPill
              label="Mayer"
              value={data.mayer.toFixed(2)}
              warn={mayerWarn}
            />
            <StatPill
              label="恐贪"
              value={`${data.fearGreed} ${data.fearGreedLabel}`}
              warn={fgWarn}
            />
            {data.btcDominance > 0 && (
              <StatPill
                label="BTC.D"
                value={`${data.btcDominance.toFixed(1)}%`}
              />
            )}
            <StatPill
              label="BTC"
              value={`$${Math.round(data.btcPrice).toLocaleString()}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
