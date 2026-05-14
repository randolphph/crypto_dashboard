'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { useMnav, useMnavHealth } from '@/hooks/useMnav';
import { MNAV_INTERVALS, type MnavInterval, type MnavPoint } from '@/types/mnav';

const INTERVAL_LABELS: Record<MnavInterval, string> = {
  '1h': '小时',
  '1d': '日',
  '1w': '周',
  '1M': '月',
  '1Q': '季',
  '1Y': '年',
};

function formatTick(ts: number, interval: MnavInterval): string {
  const d = new Date(ts * 1000);
  if (interval === '1h') {
    return d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit' });
  }
  if (interval === '1Y') {
    return d.toLocaleDateString([], { year: 'numeric' });
  }
  if (interval === '1Q' || interval === '1M') {
    return d.toLocaleDateString([], { year: '2-digit', month: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatFullTime(ts: number, interval: MnavInterval): string {
  const d = new Date(ts * 1000);
  if (interval === '1h') return d.toLocaleString();
  return d.toLocaleDateString();
}

function formatUsdCompact(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toFixed(0)}`;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 60) return `${seconds}s 前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

export function MnavChart() {
  const [interval, setIntervalValue] = useState<MnavInterval>('1d');
  const { data, isLoading, isError, error } = useMnav(interval);
  const health = useMnavHealth();

  const points = useMemo(() => data?.points ?? [], [data]);
  const latest = points[points.length - 1];

  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (points.length === 0) return undefined;
    const vals = points.map((p) => p.mnav).filter((v) => Number.isFinite(v));
    if (vals.length === 0) return undefined;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.1 || max * 0.05 || 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [points]);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold">MSTR / BTC mNAV</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            市值 ÷ (BTC 持仓 × BTC 价格)
            {health.data?.lastFetch && (
              <span className="ml-2">
                · 数据更新于{' '}
                {timeAgo(
                  Math.max(
                    health.data.lastFetch.binance,
                    health.data.lastFetch.mstrPrice,
                    health.data.lastFetch.secShares,
                    health.data.lastFetch.secHoldings
                  )
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-1">
          {MNAV_INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setIntervalValue(iv)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                interval === iv
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {INTERVAL_LABELS[iv]}
            </button>
          ))}
        </div>
      </div>

      {latest && (
        <div className="flex items-baseline gap-4 mb-3">
          <div>
            <div className="text-xs text-muted-foreground">当前 mNAV</div>
            <div className="text-2xl font-semibold">{latest.mnav.toFixed(2)}x</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">MSTR 价格</div>
            <div className="text-sm">${latest.mstrClose.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">MSTR 股本</div>
            <div className="text-sm">{(latest.sharesOutstanding / 1e6).toFixed(2)}M</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">市值</div>
            <div className="text-sm">{formatUsdCompact(latest.marketCap)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">NAV</div>
            <div className="text-sm">{formatUsdCompact(latest.nav)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">BTC 持仓</div>
            <div className="text-sm">{latest.btcHoldings.toLocaleString()} ₿</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">BTC 价格</div>
            <div className="text-sm">${latest.btcClose.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="h-[280px] animate-pulse rounded bg-muted" />
      ) : isError ? (
        <div className="flex items-center justify-center h-[280px] rounded border border-dashed text-sm text-muted-foreground">
          加载失败：{error instanceof Error ? error.message : '未知错误'}
        </div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center h-[280px] rounded border border-dashed text-sm text-muted-foreground">
          暂无数据
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" opacity={0.5} />
            <XAxis
              dataKey="ts"
              tickFormatter={(ts: number) => formatTick(ts, interval)}
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground, #9ca3af)"
              tickLine={false}
              axisLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v: number) => `${v.toFixed(2)}x`}
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground, #9ca3af)"
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <ReferenceLine y={1} stroke="var(--color-muted-foreground, #9ca3af)" strokeDasharray="4 4" opacity={0.5} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as MnavPoint;
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md space-y-0.5">
                    <p className="text-muted-foreground">{formatFullTime(p.ts, interval)}</p>
                    <p className="font-semibold text-sm">mNAV {p.mnav.toFixed(3)}x</p>
                    <p>MSTR ${p.mstrClose.toFixed(2)}</p>
                    <p>BTC ${p.btcClose.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    <p>持仓 {p.btcHoldings.toLocaleString()} ₿</p>
                    <p>股本 {(p.sharesOutstanding / 1e6).toFixed(2)}M</p>
                    {p.isExtrapolated && <p className="text-amber-500">* 基于最新披露推算</p>}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="mnav"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
