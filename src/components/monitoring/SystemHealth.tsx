'use client';

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ServerCrash,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useRuntimeMonitorStatuses,
  useSystemStatus,
} from '@/hooks/useCryptoSentry';
import { formatDateTime } from '@/lib/cryptoSentry/format';
import { cn } from '@/lib/utils';

function formatUptime(startedAt: string, serverTime: string): string {
  const milliseconds = Date.parse(serverTime) - Date.parse(startedAt);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  const minutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${remainingMinutes}分钟`;
  return `${remainingMinutes}分钟`;
}

export function SystemHealth() {
  const summaryQuery = useSystemStatus();
  const monitorsQuery = useRuntimeMonitorStatuses();
  const summary = summaryQuery.data;
  const offline = summaryQuery.isError || summaryQuery.isRefetchError;
  const isFetching = summaryQuery.isFetching || monitorsQuery.isFetching;
  const problemMonitors = (monitorsQuery.data?.items ?? []).filter(
    (monitor) => monitor.enabled && monitor.status !== 'ok'
  );

  const status = offline ? 'offline' : summary?.status ?? 'loading';
  const statusCopy = {
    healthy: {
      label: '服务正常',
      description: 'API、调度心跳和运行组件均正常',
      className: 'text-emerald-600 dark:text-emerald-400',
      icon: CheckCircle2,
    },
    degraded: {
      label: '部分异常',
      description: '服务在线，但存在预热、过期或错误的监控',
      className: 'text-amber-600 dark:text-amber-400',
      icon: AlertTriangle,
    },
    unhealthy: {
      label: '引擎异常',
      description: '服务在线，但调度心跳或运行组件异常',
      className: 'text-destructive',
      icon: ServerCrash,
    },
    offline: {
      label: '无法连接后端',
      description: summaryQuery.error?.message ?? '最近一次状态检查失败',
      className: 'text-destructive',
      icon: WifiOff,
    },
    loading: {
      label: '正在检查',
      description: '正在读取 CryptoSentry 服务状态',
      className: 'text-muted-foreground',
      icon: Clock3,
    },
  }[status];
  const StatusIcon = statusCopy.icon;

  const refresh = () => {
    void Promise.all([summaryQuery.refetch(), monitorsQuery.refetch()]);
  };

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={cn('rounded-lg bg-muted p-2', statusCopy.className)}>
              <StatusIcon className={cn('size-5', status === 'loading' && 'animate-pulse')} />
            </div>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                后端运行状态
                <Badge variant={offline ? 'destructive' : 'outline'}>
                  {offline ? <WifiOff /> : <Wifi />}
                  {statusCopy.label}
                </Badge>
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{statusCopy.description}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={isFetching}>
            <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
            立即检查
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {summary ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <div className="rounded-lg bg-muted/55 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">引擎心跳</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                <Activity className="size-3.5 text-emerald-500" />
                {formatDateTime(summary.engineHeartbeatAt)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/55 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">持续运行</p>
              <p className="mt-1 text-sm font-medium">
                {formatUptime(summary.startedAt, summary.serverTime)}
              </p>
            </div>
            <div className="rounded-lg bg-muted/55 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">监控任务</p>
              <p className="mt-1 text-sm font-medium">
                {summary.monitors.healthy}/{summary.monitors.total} 正常
              </p>
            </div>
            <div className="rounded-lg bg-muted/55 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">未处理告警</p>
              <p className="mt-1 text-sm font-medium">{summary.alerts.open}</p>
            </div>
          </div>
        ) : (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        )}

        {problemMonitors.length > 0 && !offline ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {problemMonitors.slice(0, 4).map((monitor) => (
              <span
                key={monitor.id}
                className="rounded-full border border-amber-500/25 bg-amber-500/8 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300"
                title={monitor.lastError ?? undefined}
              >
                {monitor.name} · {monitor.status}
              </span>
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-[11px] text-muted-foreground">
          页面每 10 秒检查一次 API 与引擎心跳。关闭网页不会停止云端监控。
        </p>
      </CardContent>
    </Card>
  );
}
