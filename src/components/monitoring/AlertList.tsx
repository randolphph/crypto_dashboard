'use client';

import { BellRing, CheckCheck, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/cryptoSentry/format';
import { cn } from '@/lib/utils';
import type {
  AlertSeverity,
  AlertStatus,
  CryptoSentryAlert,
} from '@/types/cryptoSentry';

const FILTERS: Array<{ value: AlertStatus | 'all'; label: string }> = [
  { value: 'open', label: '未处理' },
  { value: 'acknowledged', label: '已确认' },
  { value: 'resolved', label: '已解决' },
  { value: 'all', label: '全部' },
];

const SEVERITY_COPY: Record<AlertSeverity, { label: string; className: string }> = {
  info: { label: '提示', className: 'border-blue-500/30 text-blue-700 dark:text-blue-300' },
  warning: { label: '警告', className: 'border-amber-500/30 text-amber-700 dark:text-amber-300' },
  critical: { label: '严重', className: 'border-orange-500/30 text-orange-700 dark:text-orange-300' },
  emergency: { label: '紧急', className: 'border-destructive/30 text-destructive' },
};

function AlertRow({
  alert,
  onAction,
  actionPending,
}: {
  alert: CryptoSentryAlert;
  onAction: (id: string, action: 'acknowledge' | 'resolve') => Promise<unknown>;
  actionPending: boolean;
}) {
  const severity = SEVERITY_COPY[alert.severity] ?? SEVERITY_COPY.warning;
  return (
    <div className="grid gap-3 border-b py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={severity.className}>
            {severity.label}
          </Badge>
          <p className="font-medium">{alert.title}</p>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{alert.message}</p>
        {alert.currentValue !== null || alert.threshold !== null ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {alert.metricName ?? '指标'}: {alert.currentValue ?? '—'}
            {alert.threshold !== null ? ` · 阈值 ${alert.threshold}` : ''}
          </p>
        ) : null}
      </div>
      <div className="text-left md:text-right">
        <p className="text-xs text-muted-foreground">{formatDateTime(alert.observedAt)}</p>
        <p
          className={cn(
            'mt-1 text-xs font-medium',
            alert.status === 'open'
              ? 'text-destructive'
              : alert.status === 'acknowledged'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
          )}
        >
          {alert.status === 'open'
            ? '未处理'
            : alert.status === 'acknowledged'
              ? '已确认'
              : '已解决'}
        </p>
        <div className="mt-2 flex gap-1 md:justify-end">
          {alert.status === 'open' ? (
            <Button size="sm" variant="outline" disabled={actionPending} onClick={() => void onAction(alert.id, 'acknowledge')}>
              <CheckCheck /> 确认
            </Button>
          ) : null}
          {alert.status !== 'resolved' ? (
            <Button size="sm" variant="ghost" disabled={actionPending} onClick={() => void onAction(alert.id, 'resolve')}>
              解决
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface AlertListProps {
  status: AlertStatus | 'all';
  onStatusChange: (status: AlertStatus | 'all') => void;
  alerts: CryptoSentryAlert[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRefresh: () => void;
  onAction: (id: string, action: 'acknowledge' | 'resolve') => Promise<unknown>;
  actionPending: boolean;
}

export function AlertList({
  status,
  onStatusChange,
  alerts,
  total,
  isLoading,
  isFetching,
  error,
  onRefresh,
  onAction,
  actionPending,
}: AlertListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="size-4" /> 告警
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              当前筛选共 {total} 条，列表最多展示最近 50 条
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
            刷新
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="告警状态筛选">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onStatusChange(filter.value)}
              aria-pressed={status === filter.value}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                status === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error.message}
          </div>
        ) : isLoading ? (
          <div className="space-y-3 py-2" aria-label="正在加载告警">
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-10 text-center">
            <BellRing className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 font-medium">当前没有告警</p>
            <p className="mt-1 text-sm text-muted-foreground">监控服务会持续评估健康因子。</p>
          </div>
        ) : (
          <div className="[content-visibility:auto]">
            {[...alerts].reverse().map((alert) => (
              <AlertRow key={alert.id} alert={alert} onAction={onAction} actionPending={actionPending} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
