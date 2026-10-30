'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { usePrivacyFormat, PRIVACY_MASK } from '@/hooks/usePrivacyFormat';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PriceAge } from '@/components/common/PriceAge';
import { AssetCategorySelect } from './AssetCategorySelect';
import { stockCategoryKey, stockCashCategoryKey, defaultStockCategory } from '@/lib/portfolio/assetCategories';
import type { valueLiabilities } from '@/lib/portfolio/liabilities';
import { buildIbkrScatter } from '@/lib/portfolio/ibkrScatter';
import { buildAShareRanking } from '@/lib/portfolio/aShareRanking';
import {
  BROKER_LABEL,
  MARKET_LABEL,
  type BrokerData,
  type DataSource,
  type EnrichedCashBalance,
  type EnrichedPosition,
  type StockBroker,
} from '@/types/stocks';

const IbkrScatter = dynamic(() => import('./IbkrScatter').then(module => module.IbkrScatter), {
  ssr: false, loading: () => <div className="h-[400px] animate-pulse rounded-lg bg-muted/40" />,
});
const AShareRanking = dynamic(() => import('./AShareRanking').then(module => module.AShareRanking), {
  ssr: false, loading: () => <div className="h-[300px] animate-pulse rounded-lg bg-muted/40" />,
});

function SourceBadge({ source }: { source: DataSource }) {
  const isApi = source === 'api';
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        isApi
          ? 'bg-primary/10 text-primary dark:text-primary classic:bg-blue-500/10 classic:text-blue-600 classic:dark:text-blue-400'
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
  aShareBalance?: { assetsValue: number; liabilitiesValue?: number; netValue: number; liabilities: ReturnType<typeof valueLiabilities>['items'] };
}

function PnlCell({
  value,
  pct,
  hidden,
  percentHidden,
  currency,
}: {
  value?: number;
  pct?: number;
  hidden: boolean;
  percentHidden: boolean;
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
          ? 'text-positive dark:text-positive classic:text-green-600 classic:dark:text-green-400'
          : 'text-negative dark:text-negative classic:text-red-600 classic:dark:text-red-400'
      )}
    >
      {hidden ? PRIVACY_MASK : (positive ? '+' : '') + formatCurrency(value, currency)}
      {pct !== undefined && !percentHidden && (
        <span className="ml-1 text-xs">
          ({pct >= 0 ? '+' : ''}
          {pct.toFixed(2)}%)
        </span>
      )}
    </span>
  );
}

function ChangeCell({ pct }: { pct?: number }) {
  const { percentHidden } = usePrivacyFormat();
  if (percentHidden) return <span className="text-muted-foreground">**%</span>;
  if (pct === undefined) return <span className="text-muted-foreground">—</span>;
  const positive = pct >= 0;
  return (
    <span
      className={cn(
        'tabular-nums text-xs',
        positive
          ? 'text-positive dark:text-positive classic:text-green-600 classic:dark:text-green-400'
          : 'text-negative dark:text-negative classic:text-red-600 classic:dark:text-red-400'
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
  const { fmtUsd, hidden, percentHidden } = usePrivacyFormat();
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
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">代码</th>
            <th className="pb-2 font-medium">市场</th>
            <th className="pb-2 text-right font-medium">数量</th>
            <th className="pb-2 text-right font-medium" title="每股／每单位成本，与现价使用相同币种">成本价</th>
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
                    <AssetCategorySelect assetId={stockCategoryKey(p.broker, p.id)} label={`${p.symbol} ${BROKER_LABEL[p.broker]}`} defaultCategoryId={defaultStockCategory(p.symbol, p.kind, p.market)} nativeStockSymbol={p.market === 'US' ? p.symbol : undefined} />
                    {p.kind === 'option' && (
                      <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning dark:text-warning classic:bg-amber-500/15 classic:text-amber-700 classic:dark:text-amber-400">
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
                  {typeof p.costBasis === 'number' && Number.isFinite(p.costBasis)
                    ? hidden ? PRIVACY_MASK : formatCurrency(p.costBasis, p.currency)
                    : '—'}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {p.price > 0 ? (
                    <span className="inline-flex flex-col items-end">
                      <span>{hidden ? PRIVACY_MASK : formatCurrency(p.price, p.currency)}</span>
                      <PriceAge updatedAt={p.priceUpdatedAt} source={p.priceSource} status={p.priceStatus} error={p.quoteError} />
                    </span>
                  ) : (
                    '—'
                  )}
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
                    percentHidden={percentHidden}
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
  aShareBalance,
}: StockSectionProps) {
  const { fmtUsd, hidden, percentHidden } = usePrivacyFormat();
  const label = BROKER_LABEL[broker];
  const [views, setViews] = useState<Partial<Record<StockBroker, 'chart' | 'details'>>>({});
  const view = views[broker] ?? 'chart';
  const setView = (mode: 'chart' | 'details') => setViews(current => ({ ...current, [broker]: mode }));
  const [replayKey, setReplayKey] = useState(0);
  const scatter = useMemo(() => buildIbkrScatter(data?.positions ?? []), [data]);
  const ranking = useMemo(() => buildAShareRanking(data?.positions ?? []), [data]);
  const hasChart = broker === 'ibkr' || broker === 'ths';

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

  if ((!data || (data.positions.length === 0 && data.cash.length === 0)) && !aShareBalance) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          {label} 暂无持仓与现金，请在设置页面添加
        </p>
      </div>
    );
  }

  const positions = data?.positions ?? [];
  const cash = data?.cash ?? [];
  const totalPnl = data?.totalPnlUsd ?? 0;
  const positive = totalPnl >= 0;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-semibold text-lg">{label}</h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {aShareBalance ? <>净资产 {Number.isFinite(aShareBalance.netValue) ? fmtUsd(aShareBalance.netValue) : '—'}</> : <>合计 {fmtUsd(data?.totalUsdValue ?? 0)}</>}
          </span>
          {positions.length > 0 && (
            <span
              className={cn(
                'font-medium',
                positive
                  ? 'text-positive dark:text-positive classic:text-green-600 classic:dark:text-green-400'
                  : 'text-negative dark:text-negative classic:text-red-600 classic:dark:text-red-400'
              )}
            >
              {hidden ? '' : positive ? '+' : ''}
              {fmtUsd(totalPnl)}
            </span>
          )}
        </div>
      </div>
      {aShareBalance && <div className="mb-4 space-y-2 text-xs text-muted-foreground">
        <p>资产合计 {fmtUsd(aShareBalance.assetsValue)} · 负债合计 {aShareBalance.liabilitiesValue === undefined ? '—（汇率不可用）' : fmtUsd(aShareBalance.liabilitiesValue)}</p>
        {aShareBalance.liabilities.map((row) => <p key={row.id}>{row.name} · {hidden ? PRIVACY_MASK : formatCurrency(row.amount, row.currency)}</p>)}
      </div>}
      {data?.apiError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {label} API 错误: {data.apiError}
        </div>
      )}
      {cash.length > 0 && (
        <CashTable cash={cash} totalUsd={data?.cashUsdValue ?? 0} />
      )}
      {positions.length > 0 && hasChart && <>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div role="group" aria-label={`${label} 展示方式`} className="inline-flex rounded-lg bg-muted/50 p-1">
            {(['chart', 'details'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode}
              onClick={() => setView(mode)} className={cn('rounded-md px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === mode ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {mode === 'chart' ? broker === 'ibkr' ? '持仓散点' : '持仓排名' : '明细'}
            </button>)}
          </div>
        </div>
        {view === 'chart' && broker === 'ibkr' && <>
          {scatter.points.length > 0 ? <IbkrScatter model={scatter} hidden={hidden} percentHidden={percentHidden} replayKey={replayKey} onReplay={() => setReplayKey(key => key + 1)} />
            : <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">暂无可绘制的持仓，请在明细中查看市值与成本数据。</p>}
          {scatter.omitted.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{scatter.omitted.length} 笔持仓缺少有效市值或盈亏率，保留在明细中。</p>}
        </>}
        {view === 'chart' && broker === 'ths' && <>
          {ranking.rows.length > 0 ? <AShareRanking model={ranking} hidden={hidden} percentHidden={percentHidden} replayKey={replayKey} onReplay={() => setReplayKey(key => key + 1)} />
            : <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">暂无可排名的持仓，请在明细中查看估值数据。</p>}
          {ranking.omitted.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{ranking.omitted.length} 笔持仓未参与排名，可在明细中查看。</p>}
        </>}
      </>}
      {positions.length > 0 && (!hasChart || view === 'details') && <PositionsTable positions={positions} />}
      {positions.length === 0 && cash.length === 0 && <p className="text-sm text-muted-foreground">暂无持仓与现金</p>}
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
        <table className="w-full min-w-[420px] text-sm">
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
                  <span className="ml-2 inline-block"><AssetCategorySelect assetId={stockCashCategoryKey(c.broker, c.id)} label={`${BROKER_LABEL[c.broker]} ${c.currency} 现金`} defaultCategoryId="cash" /></span>
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
