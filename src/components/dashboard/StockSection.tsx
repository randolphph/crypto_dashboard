'use client';

import { usePrivacyFormat, PRIVACY_MASK } from '@/hooks/usePrivacyFormat';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  BROKER_LABEL,
  MARKET_LABEL,
  type BrokerData,
  type EnrichedCashBalance,
  type EnrichedPosition,
  type StockBroker,
} from '@/types/stocks';

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
          ({positive ? '+' : ''}
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

function PositionsTable({ positions }: { positions: EnrichedPosition[] }) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">代码</th>
            <th className="pb-2 font-medium">市场</th>
            <th className="pb-2 text-right font-medium">数量</th>
            <th className="pb-2 text-right font-medium">现价</th>
            <th className="pb-2 text-right font-medium">涨跌</th>
            <th className="pb-2 text-right font-medium">市值 (USD)</th>
            <th className="pb-2 text-right font-medium">盈亏</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const displayName = p.name || p.quoteName;
            return (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2">
                  <div className="font-medium">{p.symbol}</div>
                  {displayName && (
                    <div className="text-xs text-muted-foreground">
                      {displayName}
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
