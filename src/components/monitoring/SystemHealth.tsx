'use client';

import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  ListChecks,
  RefreshCw,
  ServerCrash,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
      panelClassName: 'bg-emerald-500/[0.07]',
      icon: CheckCircle2,
    },
    degraded: {
      label: '部分异常',
      description: '服务在线，但存在预热、过期或错误的监控',
      className: 'text-amber-600 dark:text-amber-400',
      panelClassName: 'bg-amber-500/[0.08]',
      icon: AlertTriangle,
    },
    unhealthy: {
      label: '引擎异常',
      description: '服务在线，但调度心跳或运行组件异常',
      className: 'text-destructive',
      panelClassName: 'bg-destructive/[0.06]',
      icon: ServerCrash,
    },
    offline: {
      label: '无法连接后端',
      description: summaryQuery.error?.message ?? '最近一次状态检查失败',
      className: 'text-destructive',
      panelClassName: 'bg-destructive/[0.06]',
      icon: WifiOff,
    },
    loading: {
      label: '正在检查',
      description: '正在读取 CryptoSentry 服务状态',
      className: 'text-muted-foreground',
      panelClassName: 'bg-muted/45',
      icon: Clock3,
    },
  }[status];
  const StatusIcon = statusCopy.icon;

  const refresh = () => {
    void Promise.all([summaryQuery.refetch(), monitorsQuery.refetch()]);
  };

  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-0">
        <div className="grid grid-cols-2 md:grid-cols-[1.35fr_repeat(4,minmax(0,1fr))]">
          <div className={cn('col-span-2 flex min-w-0 items-center gap-3 p-4 md:col-span-1', statusCopy.panelClassName)}>
            <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full bg-background/80 shadow-sm ring-1 ring-foreground/10', statusCopy.className)}>
              <StatusIcon className={cn('size-5', status === 'loading' && 'animate-pulse')} />
            </div>
            <div className="min-w-0"><div className="flex items-center gap-2"><p className="font-semibold">{statusCopy.label}</p><Badge variant={offline ? 'destructive' : 'outline'} className="h-5 px-1.5 text-[10px]">{offline ? <WifiOff /> : <Wifi />}云端</Badge></div><p className="mt-0.5 truncate text-xs text-muted-foreground" title={statusCopy.description}>{statusCopy.description}</p></div>
            <Button className="ml-auto shrink-0" variant="ghost" size="icon-sm" onClick={refresh} disabled={isFetching} aria-label="立即检查后端状态"><RefreshCw className={isFetching ? 'animate-spin' : undefined} /></Button>
          </div>
          {summary ? <>
            <div className="flex items-center gap-3 border-t px-4 py-3 md:border-l md:border-t-0"><Activity className="size-4 shrink-0 text-emerald-500" /><div className="min-w-0"><p className="text-[11px] text-muted-foreground">最新心跳</p><p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{formatDateTime(summary.engineHeartbeatAt)}</p></div></div>
            <div className="flex items-center gap-3 border-t px-4 py-3 md:border-l md:border-t-0"><Timer className="size-4 shrink-0 text-blue-500" /><div><p className="text-[11px] text-muted-foreground">持续运行</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{formatUptime(summary.startedAt, summary.serverTime)}</p></div></div>
            <div className="flex items-center gap-3 border-t px-4 py-3 md:border-l md:border-t-0"><ListChecks className="size-4 shrink-0 text-violet-500" /><div><p className="text-[11px] text-muted-foreground">健康任务</p><p className="mt-0.5 text-sm font-semibold tabular-nums"><span className="text-base">{summary.monitors.healthy}</span> / {summary.monitors.total}</p></div></div>
            <div className="flex items-center gap-3 border-t px-4 py-3 md:border-l md:border-t-0"><BellRing className={cn('size-4 shrink-0', summary.alerts.open > 0 ? 'text-amber-500' : 'text-muted-foreground')} /><div><p className="text-[11px] text-muted-foreground">未处理告警</p><p className="mt-0.5 text-base font-semibold tabular-nums">{summary.alerts.open}</p></div></div>
          </> : <div className="col-span-2 h-[136px] animate-pulse bg-muted/45 md:col-span-4 md:h-[68px]" />}
        </div>
        {problemMonitors.length > 0 && !offline ? <div className="flex flex-wrap gap-2 border-t px-4 py-2.5">{problemMonitors.slice(0, 4).map((monitor) => <span key={monitor.id} className="rounded-full border border-amber-500/25 bg-amber-500/8 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300" title={monitor.lastError ?? undefined}>{monitor.name} · {monitor.status}</span>)}</div> : null}
      </CardContent>
    </Card>
  );
}
