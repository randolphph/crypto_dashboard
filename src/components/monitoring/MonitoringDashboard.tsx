'use client';

import { useState } from 'react';
import { Activity, AlertTriangle, BellRing, CheckCircle2, CircleOff, Clock3, DatabaseZap, Pencil, Plus, Trash2 } from 'lucide-react';
import { AlertList } from '@/components/monitoring/AlertList';
import { CreateMonitorDialog } from '@/components/monitoring/CreateMonitorDialog';
import { DataSourceSetup } from '@/components/monitoring/DataSourceSetup';
import { RuleManager } from '@/components/monitoring/RuleManager';
import { SnapshotPanel } from '@/components/monitoring/SnapshotPanel';
import { SystemHealth } from '@/components/monitoring/SystemHealth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAlertAction, useAlerts, useCreateMonitor, useDeleteMonitor, useIntegrationCatalog,
  useIntegrationReadiness, useMonitorSnapshot, useMonitors, useUpdateMonitor,
} from '@/hooks/useCryptoSentry';
import { formatDateTime } from '@/lib/cryptoSentry/format';
import { cn } from '@/lib/utils';
import type { AlertStatus, CryptoSentryMonitor, MonitorStatus, MonitorType } from '@/types/cryptoSentry';

const STATUS: Record<MonitorStatus, { label: string; className: string; icon: typeof Activity }> = {
  warming_up: { label: '预热中', className: 'text-blue-600', icon: Clock3 },
  ok: { label: '正常', className: 'text-emerald-600', icon: CheckCircle2 },
  stale: { label: '过期', className: 'text-amber-600', icon: AlertTriangle },
  error: { label: '异常', className: 'text-destructive', icon: AlertTriangle },
};
const TYPE_LABEL: Record<MonitorType, string> = {
  market: 'Binance 行情', aave_account: 'Aave 地址', aave_pool: 'Aave 池子',
  uniswap_position: 'Uniswap LP', uniswap_wallet: 'Uniswap 地址', uniswap_pool: 'Uniswap 池子',
  aave_position: 'Aave（旧版）', lp_position: 'Uniswap（旧版）',
};

function target(monitor: CryptoSentryMonitor) {
  return monitor.config.canonicalSymbol ?? monitor.config.walletAddress ?? monitor.config.tokenId ??
    monitor.config.poolAddress ?? monitor.config.poolId ?? (monitor.type === 'aave_pool' ? 'Ethereum Aave V3' : '—');
}

function MonitorItem({ monitor, selected, onSelect }: { monitor: CryptoSentryMonitor; selected: boolean; onSelect: () => void }) {
  const status = STATUS[monitor.lastStatus];
  const Icon = status.icon;
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={cn('w-full rounded-lg border p-3 text-left transition-colors', selected ? 'border-foreground/20 bg-accent shadow-sm' : 'border-transparent hover:border-border hover:bg-muted/60')}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{monitor.name}</p><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{String(target(monitor))}</p></div><Badge variant="outline" className="shrink-0 text-[10px]">{TYPE_LABEL[monitor.type]}</Badge></div><div className="mt-2 flex items-center justify-between"><p className={cn('flex items-center gap-1 text-xs font-medium', status.className)}><Icon className="size-3.5" />{monitor.enabled ? status.label : '已停用'}</p><span className="text-[11px] text-muted-foreground">{monitor.intervalSeconds}s</span></div></button>;
}

export function MonitoringDashboard() {
  const [tab, setTab] = useState('monitors');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CryptoSentryMonitor | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertStatus, setAlertStatus] = useState<AlertStatus | 'all'>('open');
  const catalogQuery = useIntegrationCatalog();
  const readinessQuery = useIntegrationReadiness();
  const monitorsQuery = useMonitors();
  const createMonitor = useCreateMonitor();
  const updateMonitor = useUpdateMonitor();
  const deleteMonitor = useDeleteMonitor();
  const alertsQuery = useAlerts(alertStatus);
  const alertAction = useAlertAction();
  const monitors = monitorsQuery.data ?? [];
  const selected = monitors.find((monitor) => monitor.id === selectedId) ?? monitors[0] ?? null;
  const snapshotQuery = useMonitorSnapshot(selected);

  return <div className="mx-auto max-w-7xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">监控中心</h1><Badge variant="secondary">云端持续运行</Badge></div><p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">统一配置 Binance 行情与链上 Aave、Uniswap 监控。网页只调用 API；采集、状态、规则和告警数据均由 CryptoSentry 后端持久化。</p></div>{tab === 'monitors' ? <Button onClick={() => setCreateOpen(true)} disabled={!catalogQuery.data || !readinessQuery.data}><Plus />添加监控</Button> : null}</div>
    <SystemHealth />

    <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
      <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b pb-2">
        <TabsTrigger value="monitors"><Activity />监控任务 <Badge variant="secondary">{monitors.length}</Badge></TabsTrigger>
        <TabsTrigger value="alerts"><BellRing />告警 <Badge variant="secondary">{alertsQuery.data?.total ?? 0}</Badge></TabsTrigger>
        <TabsTrigger value="sources"><DatabaseZap />数据源与通知</TabsTrigger>
      </TabsList>

      <TabsContent value="monitors" className="pt-4">
        {monitorsQuery.error && !monitors.length ? <Card><CardContent className="flex min-h-52 flex-col items-center justify-center text-center"><AlertTriangle className="size-8 text-destructive" /><p className="mt-3 font-medium">无法读取监控任务</p><p className="mt-1 text-sm text-muted-foreground">{monitorsQuery.error.message}</p><Button className="mt-4" variant="outline" onClick={() => monitorsQuery.refetch()}>重试</Button></CardContent></Card> : <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]"><Card className="gap-2 lg:sticky lg:top-20"><div className="flex items-center justify-between px-4"><div><p className="font-medium">监控任务</p><p className="text-xs text-muted-foreground">采集和规则分别管理</p></div><Button size="icon-sm" variant="ghost" onClick={() => setCreateOpen(true)}><Plus /></Button></div><CardContent className="space-y-1">{monitorsQuery.isLoading ? <><div className="h-24 animate-pulse rounded-lg bg-muted" /><div className="h-24 animate-pulse rounded-lg bg-muted" /></> : monitors.length === 0 ? <div className="py-10 text-center"><Activity className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">还没有监控</p><p className="mt-1 text-xs text-muted-foreground">先配置数据源，再选择要监控的对象。</p></div> : monitors.map((monitor) => <MonitorItem key={monitor.id} monitor={monitor} selected={monitor.id === selected?.id} onSelect={() => setSelectedId(monitor.id)} />)}</CardContent></Card>
          <section className="min-w-0 space-y-4">{selected ? <><div className="flex flex-wrap items-end justify-between gap-3 px-1"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{selected.name}</h2><Badge variant="outline">{TYPE_LABEL[selected.type]}</Badge></div><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{String(target(selected))} · 最近数据 {formatDateTime(selected.lastDataAt)}</p></div><div className="flex gap-1">{!['aave_position', 'lp_position'].includes(selected.type) ? <Button size="sm" variant="outline" onClick={() => setEditing(selected)}><Pencil />编辑</Button> : null}<Button size="sm" variant="outline" onClick={() => updateMonitor.mutate({ id: selected.id, patch: { enabled: !selected.enabled } })} disabled={updateMonitor.isPending}><CircleOff />{selected.enabled ? '停用采集' : '启用采集'}</Button><Button size="icon-sm" variant="ghost" className="text-destructive" onClick={async () => { if (!window.confirm(`删除监控“${selected.name}”及其规则？`)) return; await deleteMonitor.mutateAsync(selected.id); setSelectedId(null); }}><Trash2 /></Button></div></div><SnapshotPanel snapshot={snapshotQuery.data} loading={snapshotQuery.isLoading} fetching={snapshotQuery.isFetching} error={snapshotQuery.error} onRefresh={() => void snapshotQuery.refetch()} />{catalogQuery.data ? <RuleManager monitor={selected} catalog={catalogQuery.data} /> : null}</> : <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><Activity className="size-9 text-muted-foreground" /><p className="mt-3 font-medium">添加第一个监控任务</p><p className="mt-1 text-sm text-muted-foreground">行情、协议池和地址仓位都可以独立配置采集与告警条件。</p></CardContent></Card>}</section></div>}
      </TabsContent>

      <TabsContent value="alerts" className="pt-4"><AlertList status={alertStatus} onStatusChange={setAlertStatus} alerts={alertsQuery.data?.items ?? []} total={alertsQuery.data?.total ?? 0} isLoading={alertsQuery.isLoading} isFetching={alertsQuery.isFetching} error={alertsQuery.error} onRefresh={() => void alertsQuery.refetch()} onAction={(id, action) => alertAction.mutateAsync({ id, action })} actionPending={alertAction.isPending} /></TabsContent>
      <TabsContent value="sources" className="pt-4"><DataSourceSetup catalog={catalogQuery.data} readiness={readinessQuery.data} isLoading={catalogQuery.isLoading || readinessQuery.isLoading} isFetching={catalogQuery.isFetching || readinessQuery.isFetching} error={catalogQuery.error ?? readinessQuery.error} onRefresh={() => void Promise.all([catalogQuery.refetch(), readinessQuery.refetch()])} /></TabsContent>
    </Tabs>

    {catalogQuery.data && readinessQuery.data ? <CreateMonitorDialog open={createOpen} onOpenChange={setCreateOpen} catalog={catalogQuery.data} readiness={readinessQuery.data} onCreate={async (input) => { const created = await createMonitor.mutateAsync(input); setSelectedId(created.id); return created; }} /> : null}
    {editing && catalogQuery.data && readinessQuery.data ? <CreateMonitorDialog key={editing.id} open onOpenChange={(next) => !next && setEditing(null)} catalog={catalogQuery.data} readiness={readinessQuery.data} monitor={editing} onCreate={(input) => createMonitor.mutateAsync(input)} onUpdate={(patch) => updateMonitor.mutateAsync({ id: editing.id, patch })} /> : null}
  </div>;
}
