'use client';

import { AlertTriangle, Check } from 'lucide-react';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import type { CapStatus, CapTotals } from '@/lib/portfolio/caps';

interface PositionCapAlertsProps {
  totals: CapTotals;
  statuses: CapStatus[];
}

const SEVERITY_COLOR: Record<CapStatus['severity'], string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  breach: 'text-red-600 dark:text-red-400',
};

const SEVERITY_BG: Record<CapStatus['severity'], string> = {
  ok: 'bg-emerald-500/5 border-emerald-500/20',
  warn: 'bg-amber-500/10 border-amber-500/30',
  breach: 'bg-red-500/10 border-red-500/30',
};

export function PositionCapAlerts({ totals, statuses }: PositionCapAlertsProps) {
  const { fmtUsd } = usePrivacyFormat();
  if (totals.total <= 0 || statuses.length === 0) return null;

  const breaches = statuses.filter((s) => s.severity !== 'ok');
  const allOk = breaches.length === 0;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold">仓位监控</h3>
          <span className="text-[11px] text-muted-foreground">
            基准：加密 + 稳定币 共 {fmtUsd(totals.total)}
          </span>
        </div>
        {allOk ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            全部合规
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {breaches.length} 项需关注
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {statuses.map((s) => {
          const pct = (s.pct * 100).toFixed(1);
          const threshold = (s.threshold * 100).toFixed(0);
          const hint =
            s.kind === 'over' ? `上限 ${threshold}%` : `安全线 ≥ ${threshold}%`;
          const overshoot =
            s.kind === 'over'
              ? s.pct - s.threshold
              : s.threshold - s.pct;
          return (
            <div
              key={s.bucket}
              className={`rounded-lg border px-3 py-2 ${SEVERITY_BG[s.severity]}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium">{s.label}</span>
                <span
                  className={`text-sm font-semibold tabular-nums ${SEVERITY_COLOR[s.severity]}`}
                >
                  {pct}%
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between text-[11px] text-muted-foreground">
                <span>{hint}</span>
                {s.severity !== 'ok' && (
                  <span className={SEVERITY_COLOR[s.severity]}>
                    {s.kind === 'over' ? '+' : '-'}
                    {(overshoot * 100).toFixed(1)}pp
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
