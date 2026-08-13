'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFx } from '@/hooks/useFx';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { usePortfolioHistoryStore } from '@/stores/portfolioHistoryStore';
import type { LedgerAccount, LedgerActivity } from '@/types/ledger';
import {
  TRADING_EMOTION_LABEL,
  type DailyTradingReview,
} from '@/types/review';

const CHART_RANGES = [
  { id: 'month', label: '月', title: '近一个月', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'quarter', label: '季', title: '近一季度', ms: 90 * 24 * 60 * 60 * 1000 },
  { id: 'year', label: '年', title: '近一年', ms: 365 * 24 * 60 * 60 * 1000 },
] as const;

type ChartRangeId = (typeof CHART_RANGES)[number]['id'];

interface ChartPoint {
  timestamp: number;
  value: number;
}

interface TradeBubblePoint extends ChartPoint {
  side: 'buy' | 'sell';
  activities: LedgerActivity[];
  usdValue: number;
  ratio: number;
  radius: number;
  review?: DailyTradingReview;
}

function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localNoon(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getTime();
}

function formatAxisDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: '2-digit',
    month: '2-digit',
  }).format(timestamp);
}

function formatDay(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);
}

function formatNumber(value: number, digits = 6): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value);
}

function actionLabel(activity: LedgerActivity): string {
  if (activity.kind === 'delivery') return '到期交割';
  if (activity.operation === 'open') return activity.side === 'buy' ? '买入开仓' : '卖出开仓';
  if (activity.operation === 'close') return activity.side === 'buy' ? '买入平仓' : '卖出平仓';
  if (activity.operation === 'add') return activity.side === 'buy' ? '买入加仓' : '卖出加仓';
  if (activity.operation === 'reduce') return activity.side === 'buy' ? '买入减仓' : '卖出减仓';
  if (activity.operation === 'reverse') return '反向开仓';
  if (activity.instrumentType === 'crypto_spot') return activity.side === 'buy' ? '现货买入' : '现货卖出';
  return activity.side === 'buy' ? '买入' : '卖出';
}

function approximateUsd(
  activity: LedgerActivity,
  fx: { cnyUsd: number; hkdUsd: number; krwUsd: number } | undefined
): number | null {
  const localNotional = Math.abs(activity.quantity * activity.price * activity.multiplier);
  const currency = activity.currency.toUpperCase();
  if (['USD', 'USDT', 'USDC'].includes(currency)) return localNotional;
  if (activity.indexPrice && ['BTC', 'ETH'].includes(currency)) {
    return localNotional * activity.indexPrice;
  }
  if (!fx) return null;
  if (currency === 'CNY') return localNotional * fx.cnyUsd;
  if (currency === 'HKD') return localNotional * fx.hkdUsd;
  if (currency === 'KRW') return localNotional * fx.krwUsd;
  return null;
}

function valueAt(points: ChartPoint[], timestamp: number): number {
  let before: ChartPoint | undefined;
  let after: ChartPoint | undefined;
  for (const point of points) {
    if (point.timestamp <= timestamp) before = point;
    else {
      after = point;
      break;
    }
  }
  if (before && after) {
    const progress = (timestamp - before.timestamp) / (after.timestamp - before.timestamp);
    return before.value + (after.value - before.value) * progress;
  }
  return before?.value ?? after?.value ?? 0;
}

function TradeBubbleShape(props: {
  cx?: number;
  cy?: number;
  payload?: TradeBubblePoint;
}) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const offsetY = payload.side === 'buy' ? -9 : 9;
  return (
    <circle
      cx={cx}
      cy={cy + offsetY}
      r={payload.radius}
      fill={payload.side === 'buy' ? '#10b981' : '#ef4444'}
      fillOpacity={0.78}
      stroke="var(--background)"
      strokeWidth={2}
      className="cursor-pointer"
    />
  );
}

export function DailyTradeTimeline({
  activities,
  accounts,
  reviews,
}: {
  activities: LedgerActivity[];
  accounts: LedgerAccount[];
  reviews: DailyTradingReview[];
  onEditReview: (date: string) => void;
}) {
  const snapshots = usePortfolioHistoryStore((state) => state.snapshots);
  const fxQuery = useFx();
  const { fmtUsd, hidden } = usePrivacyFormat();
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<ChartRangeId>('year');

  useEffect(() => setMounted(true), []);

  const activeRange = CHART_RANGES.find((item) => item.id === range) ?? CHART_RANGES[2];
  const cutoff = Date.now() - activeRange.ms;
  const chartData = useMemo<ChartPoint[]>(
    () => snapshots
      .filter((snapshot) => snapshot.timestamp >= cutoff)
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp),
    [cutoff, snapshots]
  );

  const tradePoints = useMemo<TradeBubblePoint[]>(() => {
    if (chartData.length < 2) return [];
    const lo = chartData[0].timestamp;
    const hi = chartData[chartData.length - 1].timestamp;
    const groups = new Map<string, LedgerActivity[]>();
    for (const activity of activities) {
      if (
        activity.occurredAt < lo ||
        activity.occurredAt > hi ||
        activity.status === 'cancelled' ||
        activity.status === 'corrected'
      ) continue;
      const key = `${localDayKey(activity.occurredAt)}:${activity.side}`;
      const group = groups.get(key);
      if (group) group.push(activity);
      else groups.set(key, [activity]);
    }
    const reviewMap = new Map(reviews.map((review) => [review.date, review]));
    return [...groups.entries()].map(([key, grouped]) => {
      const date = key.slice(0, 10);
      const timestamp = localNoon(date);
      const portfolioValue = valueAt(chartData, timestamp);
      const usdValue = grouped.reduce(
        (sum, activity) => sum + (approximateUsd(activity, fxQuery.data) ?? 0),
        0
      );
      const ratio = portfolioValue > 0 ? usdValue / portfolioValue : 0;
      // Bubble area grows with portfolio impact. Twenty percent of the
      // portfolio reaches the visual cap so one outlier cannot hide all peers.
      const radius = 5 + 17 * Math.sqrt(Math.min(Math.max(ratio, 0) / 0.2, 1));
      return {
        timestamp,
        value: portfolioValue,
        side: grouped[0].side,
        activities: grouped.slice().sort((a, b) => a.occurredAt - b.occurredAt),
        usdValue,
        ratio,
        radius,
        review: reviewMap.get(date),
      };
    }).sort((a, b) => a.timestamp - b.timestamp);
  }, [activities, chartData, fxQuery.data, reviews]);

  if (!mounted) {
    return <div className="h-[330px] animate-pulse rounded-xl bg-muted" />;
  }

  if (chartData.length < 2) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{activeRange.title}资产与交易</CardTitle>
            <div className="flex rounded-lg bg-muted p-0.5">
              {CHART_RANGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setRange(item.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${range === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          该范围资产历史数据不足，至少需要两个快照才能生成曲线。
        </CardContent>
      </Card>
    );
  }

  const first = chartData[0];
  const last = chartData[chartData.length - 1];
  const values = chartData.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.1 || max * 0.02;
  const yDomain: [number, number] = [Math.max(0, min - padding), max + padding];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{activeRange.title}资产与交易</CardTitle>
          <CardDescription>交易按天聚合；气泡大小表示交易金额占当时总资产的比例。</CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-emerald-500" />买入</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-rose-500" />卖出</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full border border-muted-foreground" /><i className="size-4 rounded-full border border-muted-foreground" />组合占比</span>
          </div>
          <div className="flex rounded-lg bg-muted p-0.5">
            {CHART_RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setRange(item.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  range === item.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 28, right: 12, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="ledgerPortfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
              type="number"
              dataKey="timestamp"
              domain={[first.timestamp, last.timestamp]}
              tickFormatter={formatAxisDate}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              scale="time"
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(value: number) => hidden ? '******' : fmtUsd(value)}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              width={hidden ? 64 : 92}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const bubble = payload.find((item) => (item.payload as TradeBubblePoint)?.activities)?.payload as TradeBubblePoint | undefined;
                if (bubble) {
                  const bubbleDay = localDayKey(bubble.timestamp);
                  const dayPoints = tradePoints.filter(
                    (point) => localDayKey(point.timestamp) === bubbleDay
                  );
                  const dayActivities = dayPoints
                    .flatMap((point) => point.activities)
                    .sort((a, b) => a.occurredAt - b.occurredAt);
                  const buyValue = dayPoints
                    .filter((point) => point.side === 'buy')
                    .reduce((sum, point) => sum + point.usdValue, 0);
                  const sellValue = dayPoints
                    .filter((point) => point.side === 'sell')
                    .reduce((sum, point) => sum + point.usdValue, 0);
                  const review = dayPoints.find((point) => point.review)?.review;
                  return (
                    <div className="max-w-sm rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <span className="text-xs text-muted-foreground">{formatDay(bubble.timestamp)} · {dayActivities.length} 笔</span>
                        <div className="flex items-center gap-3">
                          {buyValue > 0 && <strong className="text-emerald-600">买入 {hidden ? '******' : fmtUsd(buyValue)}</strong>}
                          {sellValue > 0 && <strong className="text-rose-600">卖出 {hidden ? '******' : fmtUsd(sellValue)}</strong>}
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {dayActivities.slice(0, 10).map((activity) => {
                          const account = accounts.find((item) => item.id === activity.accountId);
                          const name = account?.platform === 'ths' && activity.name ? activity.name : activity.symbol;
                          const notional = Math.abs(activity.quantity * activity.price * activity.multiplier);
                          return (
                            <div key={activity.id} className="flex items-baseline justify-between gap-4 text-xs">
                              <span><strong>{name}</strong> · <span className={activity.side === 'buy' ? 'text-emerald-600' : 'text-rose-600'}>{actionLabel(activity)}</span></span>
                              <span className="text-muted-foreground">成交 {formatNumber(notional, 8)} {activity.currency}</span>
                            </div>
                          );
                        })}
                        {dayActivities.length > 10 && <p className="text-xs text-muted-foreground">另有 {dayActivities.length - 10} 笔交易，请在流水中查看。</p>}
                      </div>
                      {review && (
                        <div className="mt-2 border-t pt-2 text-xs">
                          <strong>{TRADING_EMOTION_LABEL[review.emotion]} {review.intensity}/5</strong>
                          {review.emotionNote && <span className="ml-1 text-muted-foreground">· {review.emotionNote}</span>}
                        </div>
                      )}
                    </div>
                  );
                }
                const point = payload[0].payload as ChartPoint;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                    <p className="text-xs text-muted-foreground">{formatDay(point.timestamp)}</p>
                    <p className="font-semibold">{hidden ? '******' : fmtUsd(point.value)}</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#ledgerPortfolioGradient)"
              dot={false}
            />
            <Scatter data={tradePoints} dataKey="value" shape={<TradeBubbleShape />} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
