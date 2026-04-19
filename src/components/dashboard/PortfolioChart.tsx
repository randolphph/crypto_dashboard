'use client';

import { useState, useMemo, useCallback } from 'react';
import { Download } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  usePortfolioHistoryStore,
  type PortfolioSnapshot,
} from '@/stores/portfolioHistoryStore';
import { formatUsd } from '@/lib/format';

const RANGES = [
  { id: 'hour', label: '小时', ms: 60 * 60 * 1000 },
  { id: 'day', label: '日', ms: 24 * 60 * 60 * 1000 },
  { id: 'week', label: '周', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: 'month', label: '月', ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

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
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function PortfolioChart() {
  const snapshots = usePortfolioHistoryStore((s) => s.snapshots);
  const [range, setRange] = useState<RangeId>('day');

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

  const data = useMemo(() => {
    const now = Date.now();
    const rangeMs = RANGES.find((r) => r.id === range)!.ms;
    const cutoff = now - rangeMs;
    return snapshots
      .filter((s) => s.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [snapshots, range]);

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
        <div className="flex items-center gap-2 text-sm">
          {data.length >= 2 && (
            <span className={isPositive ? 'text-green-500' : 'text-red-500'}>
              {isPositive ? '+' : ''}{formatUsd(change)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
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
            onClick={exportCsv}
            title="导出 CSV"
            className="p-1 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

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
                  stopColor={isPositive ? '#10b981' : '#ef4444'}
                  stopOpacity={0.2}
                />
                <stop
                  offset="100%"
                  stopColor={isPositive ? '#10b981' : '#ef4444'}
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
              tickFormatter={(v: number) => formatUsd(v)}
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground, #9ca3af)"
              tickLine={false}
              axisLine={false}
              width={90}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const snap = payload[0].payload as PortfolioSnapshot;
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                    <p className="text-muted-foreground">
                      {new Date(snap.timestamp).toLocaleString()}
                    </p>
                    <p className="font-semibold">{formatUsd(snap.value)}</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isPositive ? '#10b981' : '#ef4444'}
              strokeWidth={2}
              fill="url(#valueGradient)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
