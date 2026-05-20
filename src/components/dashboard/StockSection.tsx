'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { usePrivacyFormat, PRIVACY_MASK } from '@/hooks/usePrivacyFormat';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  BROKER_LABEL,
  MARKET_LABEL,
  type BrokerData,
  type DataSource,
  type EnrichedCashBalance,
  type EnrichedPosition,
  type StockBroker,
} from '@/types/stocks';

function SourceBadge({ source }: { source: DataSource }) {
  const isApi = source === 'api';
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        isApi
          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          : 'bg-secondary text-muted-foreground'
      )}
    >
      {isApi ? 'API' : '手动'}
    </span>
  );
}

interface StockSectionProps {
  broker: StockBroker;
  data?: BrokerData;
  isLoading: boolean;
  error?: Error | null;
}

function PnlCell({
  value,
  pct,
  hidden,
  currency,
}: {
  value?: number;
  pct?: number;
  hidden: boolean;
  currency: string;
}) {
  if (value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  const positive = value >= 0;
  return (
    <span
      className={cn(
        'tabular-nums font-medium',
        positive
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400'
      )}
    >
      {hidden ? PRIVACY_MASK : (positive ? '+' : '') + formatCurrency(value, currency)}
      {pct !== undefined && !hidden && (
        <span className="ml-1 text-xs">
          ({pct >= 0 ? '+' : ''}
          {pct.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

function ChangeCell({ pct }: { pct?: number }) {
  if (pct === undefined) return <span className="text-muted-foreground">—</span>;
  const positive = pct >= 0;
  return (
    <span
      className={cn(
        'tabular-nums text-xs',
        positive
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400'
      )}
    >
      {positive ? '+' : ''}
      {pct.toFixed(2)}%
    </span>
  );
}

type SortKey = 'changePct' | 'marketValueUsd' | 'pnlUsd';
type SortDir = 'desc' | 'asc';

function PositionsTable({ positions }: { positions: EnrichedPosition[] }) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (!sortKey) return positions;
    const arr = [...positions];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Pin rows missing this metric to the bottom regardless of direction —
      // ranking "unknown" against a number isn't meaningful.
      if (av === undefined && bv === undefined) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return arr;
  }, [positions, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortDir('asc');
    } else {
      setSortKey(null);
    }
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => {
    const active = sortKey === k;
    return (
      <th className="pb-2 text-right font-medium">
        <button
          onClick={() => toggleSort(k)}
          className={cn(
            'inline-flex items-center gap-1 hover:text-foreground',
            active && 'text-foreground'
          )}
        >
          {label}
          {active ? (
            sortDir === 'desc' ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )
          ) : (
            <ChevronsUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">代码</th>
            <th className="pb-2 font-medium">市场</th>
            <th className="pb-2 text-right font-medium">数量</th>
            <th className="pb-2 text-right font-medium">现价</th>
            <SortHeader label="涨跌" k="changePct" />
            <SortHeader label="市值 (USD)" k="marketValueUsd" />
            <SortHeader label="盈亏" k="pnlUsd" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const displayName = p.name || p.quoteName;
            // US tickers (stocks + options) are self-descriptive — hide the
            // company / contract name to keep the row compact. Other markets
            // (HK numeric codes, A-shares) lead with the name and put the
            // code on the subtitle line.
            const isUs = p.market === 'US';
            const primary = !isUs && displayName ? displayName : p.symbol;
            const secondary = isUs
              ? undefined
              : displayName
                ? p.symbol
                : undefined;
            return (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{primary}</span>
                    <SourceBadge source={p.source} />
                    {p.kind === 'option' && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                        期权
                      </span>
                    )}
                  </div>
                  {secondary && (
                    <div className="text-xs text-muted-foreground">
                      {secondary}
                    </div>
                  )}
                  {p.quoteError && (
                    <div className="text-xs text-destructive">
                      行情: {p.quoteError}
                    </div>
                  )}
                </td>
                <td className="py-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {MARKET_LABEL[p.market]}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">
                  {hidden ? PRIVACY_MASK : p.shares.toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {p.price > 0
                    ? formatCurrency(p.price, p.currency)
                    : '—'}
                </td>
                <td className="py-2 text-right">
                  <ChangeCell pct={p.changePct} />
                </td>
                <td className="py-2 text-right tabular-nums">
                  {fmtUsd(p.marketValueUsd)}
                </td>
                <td className="py-2 text-right">
                  <PnlCell
                    value={p.pnl}
                    pct={p.pnlPct}
                    hidden={hidden}
                    currency={p.currency}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StockSection({
  broker,
  data,
  isLoading,
  error,
}: StockSectionProps) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const label = BROKER_LABEL[broker];

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : '加载失败'}
        </p>
      </div>
    );
  }

  if (!data || (data.positions.length === 0 && data.cash.length === 0)) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          {label} 暂无持仓与现金，请在设置页面添加
        </p>
      </div>
    );
  }

  const totalPnl = data.totalPnlUsd;
  const positive = totalPnl >= 0;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{label}</h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            合计 {fmtUsd(data.totalUsdValue)}
          </span>
          {data.positions.length > 0 && (
            <span
              className={cn(
                'font-medium',
                positive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              )}
            >
              {hidden ? '' : positive ? '+' : ''}
              {fmtUsd(totalPnl)}
            </span>
          )}
        </div>
      </div>
      {data.apiError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {label} API 错误: {data.apiError}
        </div>
      )}
      {data.cash.length > 0 && (
        <CashTable cash={data.cash} totalUsd={data.cashUsdValue} />
      )}
      {data.positions.length > 0 && <PositionsTable positions={data.positions} />}
    </div>
  );
}

function CashTable({
  cash,
  totalUsd,
}: {
  cash: EnrichedCashBalance[];
  totalUsd: number;
}) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">现金</span>
        <span className="text-xs text-muted-foreground">{fmtUsd(totalUsd)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {cash.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {c.currency}
                  </span>
                  <span className="ml-2">
                    <SourceBadge source={c.source} />
                  </span>
                  {c.note && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.note}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {hidden ? '****' : formatCurrency(c.amount, c.currency)}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {fmtUsd(c.amountUsd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
