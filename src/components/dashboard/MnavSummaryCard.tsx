'use client';

import Link from 'next/link';
import { LineChart as LineChartIcon, ArrowRight } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  YAxis,
} from 'recharts';
import { useMnav } from '@/hooks/useMnav';

// Surface the latest MSTR mNAV on the home dashboard so the metric is
// discoverable without diving into /mnav. We fetch the daily series — the
// last point is the current mNAV and the second-to-last gives a day-ago
// baseline for the delta chip. The tiny sparkline behind the value uses
// the same series so visitors get a feel for trend at a glance.
export function MnavSummaryCard() {
  const { data, isLoading, isError } = useMnav('1d');
  const points = data?.points ?? [];
  const latest = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : null;

  // Backend lives separately (Mac mini behind Cloudflare Tunnel) and may be
  // offline — fail quietly rather than showing a broken card on the home page.
  if (isError) return null;

  const delta = latest && prev ? latest.mnav - prev.mnav : null;
  const deltaPct =
    latest && prev && prev.mnav > 0 ? (delta! / prev.mnav) * 100 : null;
  const positive = (delta ?? 0) >= 0;

  return (
    <Link
      href="/mnav"
      className="group flex w-full items-center justify-between rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-foreground/20 sm:w-auto sm:min-w-[320px] sm:max-w-md sm:flex-1"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <LineChartIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">MSTR mNAV</p>
          {isLoading || !latest ? (
            <div className="mt-0.5 h-6 w-20 animate-pulse rounded bg-muted" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tabular-nums">
                {latest.mnav.toFixed(2)}x
              </span>
              {delta !== null && deltaPct !== null && (
                <span
                  className={`text-xs tabular-nums ${
                    positive
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {positive ? '+' : ''}
                  {delta.toFixed(3)} ({positive ? '+' : ''}
                  {deltaPct.toFixed(2)}%)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {points.length >= 3 && (
          <div className="hidden h-10 w-28 sm:block">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
              >
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Line
                  type="monotone"
                  dataKey="mnav"
                  stroke={positive ? '#10b981' : '#ef4444'}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
