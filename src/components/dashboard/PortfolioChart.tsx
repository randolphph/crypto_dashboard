'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Download, Upload, Trash2, X } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  usePortfolioHistoryStore,
  type PortfolioSnapshot,
} from '@/stores/portfolioHistoryStore';
import { useCashFlowStore, netFlowInRange, type CashFlowEvent } from '@/stores/cashFlowStore';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';

const RANGES = [
  { id: 'hour', label: '小时', ms: 60 * 60 * 1000 },
  { id: 'day', label: '日', ms: 24 * 60 * 60 * 1000 },
  { id: 'week', label: '周', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: 'month', label: '月', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'quarter', label: '季', ms: 90 * 24 * 60 * 60 * 1000 },
  { id: 'year', label: '年', ms: 365 * 24 * 60 * 60 * 1000 },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

interface DayBucket {
  timestamp: number;
  events: CashFlowEvent[];
  net: number; // signed: deposit positive, withdraw negative
}

type ChartPoint = { timestamp: number; value: number; bucket?: DayBucket };

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function bucketByDay(events: CashFlowEvent[]): DayBucket[] {
  const groups = new Map<string, CashFlowEvent[]>();
  for (const e of events) {
    const k = dateKey(e.timestamp);
    const arr = groups.get(k);
    if (arr) arr.push(e);
    else groups.set(k, [e]);
  }
  return [...groups.values()].map((es) => ({
    timestamp: es[0].timestamp,
    events: es.slice().sort((a, b) => a.timestamp - b.timestamp),
    net: es.reduce(
      (s, e) => s + (e.type === 'deposit' ? e.amount : -e.amount),
      0
    ),
  }));
}

function formatTime(ts: number, range: RangeId): string {
  const d = new Date(ts);
  if (range === 'hour') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (range === 'day') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (range === 'week') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (range === 'year') {
    return d.toLocaleDateString([], { year: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function PortfolioChart() {
  const snapshots = usePortfolioHistoryStore((s) => s.snapshots);
  const removeSnapshot = usePortfolioHistoryStore((s) => s.removeSnapshot);
  const importSnapshots = usePortfolioHistoryStore((s) => s.importSnapshots);
  const cashFlowEvents = useCashFlowStore((s) => s.events);
  const { fmtUsd, hidden } = usePrivacyFormat();
  const [range, setRange] = useState<RangeId>('week');
  const [selected, setSelected] = useState<PortfolioSnapshot | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const exportCsv = useCallback(() => {
    if (snapshots.length === 0) return;
    const header = 'timestamp,date,value_usd';
    const rows = snapshots
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((s) => `${s.timestamp},${new Date(s.timestamp).toISOString()},${s.value}`);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [snapshots]);

  const handleImportCsv = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const lines = text.trim().split('\n').slice(1); // skip header
        const parsed: PortfolioSnapshot[] = [];
        for (const line of lines) {
          const cols = line.split(',');
          const timestamp = Number(cols[0]);
          const value = Number(cols[2]);
          if (!isNaN(timestamp) && !isNaN(value) && timestamp > 0) {
            parsed.push({ timestamp, value });
          }
        }
        if (parsed.length > 0) {
          importSnapshots(parsed);
        }
      };
      reader.readAsText(file);
      // reset so the same file can be re-imported
      e.target.value = '';
    },
    [importSnapshots]
  );

  const data = useMemo<ChartPoint[]>(() => {
    const now = Date.now();
    const rangeMs = RANGES.find((r) => r.id === range)!.ms;
    const cutoff = now - rangeMs;
    const base: ChartPoint[] = snapshots
      .filter((s) => s.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (base.length === 0) return base;

    const lo = base[0].timestamp;
    const hi = base[base.length - 1].timestamp;
    const buckets = bucketByDay(
      cashFlowEvents.filter((e) => e.timestamp >= lo && e.timestamp <= hi)
    );
    if (buckets.length === 0) return base;

    const augmented: ChartPoint[] = [...base];
    for (const bucket of buckets) {
      let before: ChartPoint | null = null;
      let after: ChartPoint | null = null;
      for (const p of base) {
        if (p.timestamp <= bucket.timestamp) before = p;
        else {
          after = p;
          break;
        }
      }
      let value = 0;
      if (before && after) {
        const t = (bucket.timestamp - before.timestamp) / (after.timestamp - before.timestamp);
        value = before.value + (after.value - before.value) * t;
      } else if (before) {
        value = before.value;
      } else if (after) {
        value = after.value;
      }
      augmented.push({ timestamp: bucket.timestamp, value, bucket });
    }
    augmented.sort((a, b) => a.timestamp - b.timestamp);
    return augmented;
  }, [snapshots, range, cashFlowEvents]);

  if (!mounted) {
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-[200px] animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (snapshots.length < 2) {
    return (
      <div className="mt-4 flex items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        数据记录中，至少需要两个数据点才能生成图表
      </div>
    );
  }

  // Calculate value change
  const change = data.length >= 2 ? data[data.length - 1].value - data[0].value : 0;
  const changePercent =
    data.length >= 2 && data[0].value > 0
      ? ((data[data.length - 1].value - data[0].value) / data[0].value) * 100
      : 0;
  const isPositive = change >= 0;

  // Cash flow within visible range
  const rangeStart = data.length >= 2 ? data[0].timestamp : 0;
  const rangeEnd = data.length >= 2 ? data[data.length - 1].timestamp : 0;
  const netFlow = netFlowInRange(cashFlowEvents, rangeStart, rangeEnd);
  // Real performance = raw change minus net flow (deposits inflate value, withdrawals deflate it)
  const adjustedChange = change - netFlow;
  const adjustedChangePercent =
    data.length >= 2 && data[0].value > 0
      ? (adjustedChange / data[0].value) * 100
      : 0;
  const isAdjustedPositive = adjustedChange >= 0;
  const visibleEvents = cashFlowEvents.filter(
    (e) => e.timestamp >= rangeStart && e.timestamp <= rangeEnd
  );
  const visibleBuckets = bucketByDay(visibleEvents);
  const hasFlow = visibleEvents.length > 0;

  // Compute Y-axis domain with padding
  const values = data.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.1 || maxVal * 0.01;
  const yDomain: [number, number] = [
    Math.max(0, minVal - padding),
    maxVal + padding,
  ];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 text-sm">
          {data.length >= 2 && (
            <span className={isPositive ? 'text-green-500' : 'text-red-500'}>
              {hidden ? (
                '******'
              ) : (
                <>
                  {isPositive ? '+' : ''}{fmtUsd(change)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                </>
              )}
            </span>
          )}
          {data.length >= 2 && hasFlow && !hidden && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded border ${
                isAdjustedPositive
                  ? 'text-green-600 border-green-500/30'
                  : 'text-red-600 border-red-500/30'
              }`}
              title={`已扣除区间内 ${netFlow >= 0 ? '净流入' : '净流出'} ${fmtUsd(Math.abs(netFlow))}`}
            >
              调整后 {isAdjustedPositive ? '+' : ''}{fmtUsd(adjustedChange)} ({isAdjustedPositive ? '+' : ''}{adjustedChangePercent.toFixed(2)}%)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  range === r.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="导入 CSV"
            className="p-1 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCsv}
          />
          <button
            onClick={exportCsv}
            title="导出 CSV"
            className="p-1 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {selected && (
        <div className="flex items-center justify-between rounded-md border bg-popover px-3 py-1.5 mb-2 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{new Date(selected.timestamp).toLocaleString()}</span>
            <span className="font-semibold">{fmtUsd(selected.value)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-red-500 hover:bg-red-500/10 rounded transition-colors"
              onClick={() => {
                removeSnapshot(selected.timestamp);
                setSelected(null);
              }}
            >
              <Trash2 className="h-3 w-3" />
              删除
            </button>
            <button
              className="p-0.5 text-muted-foreground hover:text-foreground rounded transition-colors"
              onClick={() => setSelected(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {data.length < 2 ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          该时间范围内数据不足
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={isAdjustedPositive ? '#10b981' : '#ef4444'}
                  stopOpacity={0.2}
                />
                <stop
                  offset="100%"
                  stopColor={isAdjustedPositive ? '#10b981' : '#ef4444'}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" opacity={0.5} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(ts: number) => formatTime(ts, range)}
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground, #9ca3af)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v: number) => fmtUsd(v)}
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground, #9ca3af)"
              tickLine={false}
              axisLine={false}
              width={hidden ? 60 : 90}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as ChartPoint;
                if (point.bucket) {
                  const b = point.bucket;
                  const netPositive = b.net >= 0;
                  return (
                    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                      <p className="text-muted-foreground text-xs">
                        {new Date(b.timestamp).toLocaleDateString()} · {b.events.length} 笔
                      </p>
                      <p
                        className="font-semibold"
                        style={{ color: netPositive ? '#10b981' : '#ef4444' }}
                      >
                        净 {netPositive ? '+' : ''}{fmtUsd(b.net)}
                      </p>
                      <div className="mt-1.5 space-y-0.5">
                        {b.events.map((ev) => {
                          const isWithdraw = ev.type === 'withdraw';
                          return (
                            <div
                              key={ev.id}
                              className="text-xs"
                              style={{ color: isWithdraw ? '#ef4444' : '#10b981' }}
                            >
                              {isWithdraw ? '↓ 提现' : '↑ 充值'} {fmtUsd(ev.amount)}
                              {ev.note && (
                                <span className="text-muted-foreground ml-1">
                                  · {ev.note}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                    <p className="text-muted-foreground">
                      {new Date(point.timestamp).toLocaleString()}
                    </p>
                    <p className="font-semibold">{fmtUsd(point.value)}</p>
                    <p className="text-xs text-muted-foreground mt-1">点击选中以删除</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isAdjustedPositive ? '#10b981' : '#ef4444'}
              strokeWidth={2}
              fill="url(#valueGradient)"
              dot={false}
              activeDot={{
                r: 4,
                cursor: 'pointer',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick: (_: any, e: any) => {
                  const p = e?.payload as ChartPoint | undefined;
                  if (p && !p.bucket) setSelected(p as PortfolioSnapshot);
                },
              }}
            />
            {visibleBuckets.map((b) => {
              const netPositive = b.net >= 0;
              const color = netPositive ? '#10b981' : '#ef4444';
              const sign = netPositive ? '↑' : '↓';
              const abs = Math.abs(b.net);
              const amountLabel =
                abs >= 1000 ? `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k` : `${abs}`;
              const tag =
                b.events.length > 1 ? `${sign}$${amountLabel} (${b.events.length})` : `${sign}$${amountLabel}`;
              return (
                <ReferenceLine
                  key={dateKey(b.timestamp)}
                  x={b.timestamp}
                  stroke={color}
                  strokeDasharray="3 3"
                  strokeOpacity={0.7}
                  label={{
                    value: tag,
                    position: 'top',
                    fontSize: 10,
                    fill: color,
                  }}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
