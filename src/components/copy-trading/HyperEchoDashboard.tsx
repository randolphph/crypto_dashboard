'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  History,
  LoaderCircle,
  Pencil,
  Play,
  RadioTower,
  RefreshCw,
  Settings,
  Square,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHyperliquidMonitor } from '@/hooks/useHyperliquidMonitor';
import { CopyTradePanel } from '@/components/copy-trading/CopyTradePanel';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { cn } from '@/lib/utils';
import type {
  HyperliquidMonitorEvent,
  HyperliquidMonitorEventKind,
  HyperliquidNetwork,
  HyperliquidOrder,
  HyperliquidPosition,
} from '@/types/hyperliquid';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const POLL_INTERVALS = [5, 10, 15, 30, 60] as const;
const SAVED_TARGETS_KEY = 'crypto-dashboard.hyperliquid-targets.v1';

interface SavedTarget {
  id: string;
  address: string;
  label: string;
  network: HyperliquidNetwork;
  pollInterval: number;
  lastUsedAt: number;
}

const savedTargetListeners = new Set<() => void>();

function subscribeSavedTargets(listener: () => void) {
  savedTargetListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVED_TARGETS_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    savedTargetListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSavedTargetsSnapshot() {
  return window.localStorage.getItem(SAVED_TARGETS_KEY) ?? '[]';
}

function parseSavedTargets(raw: string): SavedTarget[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedTarget => {
      if (!item || typeof item !== 'object') return false;
      const target = item as Partial<SavedTarget>;
      return typeof target.id === 'string' &&
        typeof target.address === 'string' && ADDRESS_PATTERN.test(target.address) &&
        typeof target.label === 'string' &&
        (target.network === 'mainnet' || target.network === 'testnet') &&
        typeof target.pollInterval === 'number' &&
        typeof target.lastUsedAt === 'number';
    }).slice(0, 20);
  } catch {
    return [];
  }
}

function persistSavedTargets(targets: SavedTarget[]) {
  window.localStorage.setItem(SAVED_TARGETS_KEY, JSON.stringify(targets.slice(0, 20)));
  savedTargetListeners.forEach((listener) => listener());
}

const EVENT_LABELS: Record<HyperliquidMonitorEventKind, string> = {
  position_opened: '观察到开仓',
  position_closed: '观察到清仓',
  position_increased: '观察到增仓',
  position_reduced: '观察到减仓',
  position_reversed: '仓位方向反转',
  position_settings_changed: '仓位设置变化',
  order_appeared: '新出现挂单',
  order_changed: '挂单发生变化',
  order_disappeared: '挂单已不在列表',
};

function compactAddress(address: string) {
  return address.length > 12 ? `${address.slice(0, 6)}****${address.slice(-4)}` : address;
}

function formatDecimal(value: string | null, maxFraction = 6) {
  if (value === null || value === '') return '暂不可用';
  const match = value.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const [, sign, integer, fraction = ''] = match;
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const visibleFraction = fraction.slice(0, maxFraction).replace(/0+$/, '');
  return `${sign}${grouped}${visibleFraction ? `.${visibleFraction}` : ''}`;
}

function formatUsd(value: string | null) {
  return value === null ? '暂不可用' : `$${formatDecimal(value, 2)}`;
}

function formatTime(value: number | null) {
  if (value === null) return '尚无数据';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function signOf(value: string) {
  const normalized = value.trim();
  if (/^-0(?:\.0+)?$/.test(normalized) || /^\+?0(?:\.0+)?$/.test(normalized)) return 0;
  return normalized.startsWith('-') ? -1 : 1;
}

function absoluteDecimal(value: string) {
  return value.startsWith('-') || value.startsWith('+') ? value.slice(1) : value;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card size="sm" className="gap-2">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-lg font-semibold" title={value}>{value}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={hint}>{hint}</p>
      </CardContent>
    </Card>
  );
}

function PositionTable({ positions }: { positions: HyperliquidPosition[] }) {
  if (positions.length === 0) {
    return <EmptyState icon={Activity} title="当前没有永续仓位" description="Hyperliquid 返回的默认永续仓位为空。" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">合约</th><th className="px-4 py-3 font-medium">方向 / 数量</th><th className="px-4 py-3 text-right font-medium">开仓均价</th><th className="px-4 py-3 text-right font-medium">仓位价值</th><th className="px-4 py-3 text-right font-medium">未实现盈亏</th><th className="px-4 py-3 text-right font-medium">强平价格</th><th className="px-4 py-3 text-right font-medium">杠杆</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {positions.map((position) => {
            const direction = signOf(position.size);
            return (
              <tr key={position.coin} className="hover:bg-muted/35">
                <td className="px-4 py-3 font-semibold">{position.coin}</td>
                <td className="px-4 py-3"><Badge className={cn('mr-2', direction > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600')}>{direction > 0 ? '多仓' : '空仓'}</Badge><span className="font-mono">{formatDecimal(absoluteDecimal(position.size))}</span></td>
                <td className="px-4 py-3 text-right font-mono">{position.entryPrice ? `$${formatDecimal(position.entryPrice, 6)}` : '—'}</td>
                <td className="px-4 py-3 text-right font-mono">{formatUsd(position.positionValue)}</td>
                <td className={cn('px-4 py-3 text-right font-mono', signOf(position.unrealizedPnl) > 0 ? 'text-emerald-600' : signOf(position.unrealizedPnl) < 0 ? 'text-red-600' : '')}>{formatUsd(position.unrealizedPnl)}</td>
                <td className="px-4 py-3 text-right font-mono">{position.liquidationPrice ? `$${formatDecimal(position.liquidationPrice, 6)}` : '—'}</td>
                <td className="px-4 py-3 text-right"><span className="font-mono">{position.leverage}×</span><span className="ml-1.5 text-xs text-muted-foreground">{position.marginMode === 'isolated' ? '逐仓' : '全仓'}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrderTable({ orders }: { orders: HyperliquidOrder[] }) {
  if (orders.length === 0) {
    return <EmptyState icon={Clock3} title="当前没有挂单" description="Hyperliquid 返回的默认永续挂单为空。" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-medium">合约</th><th className="px-4 py-3 font-medium">方向</th><th className="px-4 py-3 text-right font-medium">价格</th><th className="px-4 py-3 text-right font-medium">剩余 / 原始数量</th><th className="px-4 py-3 text-right font-medium">类型</th><th className="px-4 py-3 text-right font-medium">时间</th></tr></thead>
        <tbody className="divide-y">
          {orders.map((order) => (
            <tr key={order.oid} className="hover:bg-muted/35">
              <td className="px-4 py-3"><p className="font-semibold">{order.coin}</p><p className="font-mono text-[11px] text-muted-foreground">#{order.oid.slice(-8)}</p></td>
              <td className={cn('px-4 py-3 font-medium', order.side === 'buy' ? 'text-emerald-600' : 'text-red-600')}>{order.side === 'buy' ? '买入' : '卖出'}</td>
              <td className="px-4 py-3 text-right font-mono">{order.isTrigger && order.price === '0' ? '触发后市价' : `$${formatDecimal(order.price, 6)}`}{order.triggerPrice ? <p className="text-[11px] text-muted-foreground">触发 ${formatDecimal(order.triggerPrice, 6)}</p> : null}</td>
              <td className="px-4 py-3 text-right font-mono">{formatDecimal(order.remainingSize)} <span className="text-muted-foreground">/ {formatDecimal(order.originalSize)}</span></td>
              <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-1">{order.reduceOnly ? <Badge variant="outline">只减仓</Badge> : null}{order.isTrigger ? <Badge variant="outline">条件单</Badge> : null}{order.isPositionTpsl ? <Badge variant="outline">止盈止损</Badge> : null}<Badge variant="secondary">{order.tif ?? order.orderType}</Badge></div></td>
              <td className="px-4 py-3 text-right text-xs text-muted-foreground">{formatTime(order.timestampMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function eventValue(value: HyperliquidPosition | HyperliquidOrder | null) {
  if (!value) return '无';
  if ('size' in value) return `仓位 ${formatDecimal(value.size)}`;
  return `余量 ${formatDecimal(value.remainingSize)} @ $${formatDecimal(value.price, 6)}`;
}

function EventList({ events }: { events: HyperliquidMonitorEvent[] }) {
  if (events.length === 0) {
    return <EmptyState icon={History} title="还没有变化记录" description="首次查询只建立基线；后续轮询发现的仓位和挂单变化会显示在这里。" />;
  }
  return (
    <div className="divide-y">
      {events.map((event) => (
        <div key={event.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[160px_1fr_auto] sm:items-center"><div><p className="font-medium">{EVENT_LABELS[event.kind]}</p><p className="text-xs text-muted-foreground">{formatTime(event.observedAt)}</p></div><div className="min-w-0"><p className="font-semibold">{event.coin}</p><p className="truncate text-xs text-muted-foreground">{eventValue(event.before)} → {eventValue(event.after)}</p></div>{event.sourceOid ? <Badge variant="outline">挂单 #{event.sourceOid.slice(-8)}</Badge> : <Badge variant="secondary">仓位</Badge>}</div>
      ))}
    </div>
  );
}

function TradeConnections() {
  const hyperliquidAccountAddress = useApiKeyStore((state) => state.hyperliquidAccountAddress);
  const hyperliquidApiWalletPrivateKey = useApiKeyStore((state) => state.hyperliquidApiWalletPrivateKey);
  const binanceApiKey = useApiKeyStore((state) => state.binanceApiKey);
  const binanceApiSecret = useApiKeyStore((state) => state.binanceApiSecret);
  const hyperliquidReady = Boolean(hyperliquidAccountAddress && hyperliquidApiWalletPrivateKey);
  const binanceReady = Boolean(binanceApiKey && binanceApiSecret);

  return (
    <Card>
      <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>跟单账户</CardTitle><p className="mt-1 text-sm text-muted-foreground">凭证保存在钱包加密保险箱中。Hyperliquid 仅在执行预览经人工确认后签名下单。</p></div><Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}><Settings className="size-3.5" />管理 API</Link></div></CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2"><ConnectionCard name="Hyperliquid" ready={hyperliquidReady} detail={hyperliquidReady ? `凭证已保存 · ${compactAddress(hyperliquidAccountAddress)}` : '使用独立 API Wallet，不要填写主钱包私钥'} /><ConnectionCard name="Binance" ready={binanceReady} detail={binanceReady ? 'API Key 已保存，待接入下单适配' : '在设置中填写仅交易权限的 API Key'} /></CardContent>
    </Card>
  );
}

function ConnectionCard({ name, ready, detail }: { name: string; ready: boolean; detail: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"><div><p className="font-semibold">{name}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><Badge className={ready ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : ''} variant={ready ? 'default' : 'secondary'}>{ready ? '已配置' : '未配置'}</Badge></div>;
}

export function HyperliquidCopyTrading() {
  const monitor = useHyperliquidMonitor();
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState<HyperliquidNetwork>('mainnet');
  const [pollInterval, setPollInterval] = useState<number>(10);
  const [activePollInterval, setActivePollInterval] = useState<number | null>(null);
  const [tab, setTab] = useState('positions');
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const savedTargetsRaw = useSyncExternalStore(subscribeSavedTargets, getSavedTargetsSnapshot, () => '[]');
  const savedTargets = useMemo(() => parseSavedTargets(savedTargetsRaw), [savedTargetsRaw]);
  const validAddress = ADDRESS_PATTERN.test(address.trim());
  const snapshot = monitor.snapshot;
  const active = monitor.status === 'running' || monitor.status === 'loading' || monitor.status === 'error';

  function saveSuccessfulTarget(targetAddress: string, targetNetwork: HyperliquidNetwork, interval: number) {
    const normalized = targetAddress.toLowerCase();
    const id = `${targetNetwork}:${normalized}`;
    const existing = savedTargets.find((target) => target.id === id);
    const next: SavedTarget = {
      id,
      address: normalized,
      label: existing?.label || compactAddress(normalized),
      network: targetNetwork,
      pollInterval: interval,
      lastUsedAt: Date.now(),
    };
    persistSavedTargets([next, ...savedTargets.filter((target) => target.id !== id)]);
  }

  async function startMonitoring(targetAddress: string, targetNetwork: HyperliquidNetwork, interval: number) {
    setAddress(targetAddress);
    setNetwork(targetNetwork);
    setPollInterval(interval);
    setActivePollInterval(interval);
    const firstSnapshot = await monitor.start(targetAddress, targetNetwork, interval);
    if (firstSnapshot) saveSuccessfulTarget(targetAddress, targetNetwork, interval);
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validAddress) return;
    await startMonitoring(address.trim(), network, pollInterval);
  }

  function saveTargetLabel(target: SavedTarget) {
    const label = editingLabel.trim() || compactAddress(target.address);
    persistSavedTargets(savedTargets.map((item) => item.id === target.id ? { ...item, label } : item));
    setEditingTargetId(null);
    setEditingLabel('');
  }

  const status = monitor.status === 'running'
    ? { label: '网页监控中', description: `每 ${activePollInterval ?? pollInterval} 秒直接读取 Hyperliquid`, className: 'text-emerald-600 bg-emerald-500/8 dark:text-emerald-400', icon: CheckCircle2 }
    : monitor.status === 'loading'
      ? { label: '正在获取数据', description: '直接连接 Hyperliquid 官方接口', className: 'text-blue-600 bg-blue-500/8 dark:text-blue-400', icon: LoaderCircle }
      : monitor.status === 'error'
        ? { label: '查询失败', description: monitor.error ?? '稍后自动重试', className: 'text-destructive bg-destructive/8', icon: AlertTriangle }
        : snapshot
          ? { label: '监控已停止', description: '页面保留最后一次读取结果', className: 'text-muted-foreground bg-muted/45', icon: Square }
          : { label: '等待开始', description: '输入地址后点击开始监控', className: 'text-muted-foreground bg-muted/45', icon: Clock3 };
  const StatusIcon = status.icon;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">量化跟单</h1><Badge variant="outline">Hyperliquid</Badge><Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400">网页监控</Badge></div><p className="mt-1 text-sm text-muted-foreground">浏览器打开时直接跟踪目标地址的永续仓位与挂单；关闭页面后监控停止。</p></div>

      <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-20">
          <CardHeader><CardTitle>目标地址</CardTitle><p className="text-sm text-muted-foreground">无需目标账户授权，只读取公开的默认永续数据。</p></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={start}>
              <div className="space-y-2"><p className="text-sm font-medium">网络</p><div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">{(['mainnet', 'testnet'] as const).map((value) => <button key={value} type="button" onClick={() => setNetwork(value)} className={cn('rounded-md px-3 py-1.5 text-sm transition-colors', network === value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>{value === 'mainnet' ? '主网' : '测试网'}</button>)}</div></div>
              <div className="space-y-1.5"><label htmlFor="hyperliquid-target" className="block text-sm font-medium">Hyperliquid 地址</label><Input id="hyperliquid-target" className="font-mono" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x…" spellCheck={false} aria-invalid={address.length > 0 && !validAddress} />{address.length > 0 && !validAddress ? <p className="text-xs text-destructive">请输入 42 位 EVM 地址</p> : null}</div>
              <div className="space-y-2"><p className="text-sm font-medium">网页刷新间隔</p><div className="grid grid-cols-5 gap-1">{POLL_INTERVALS.map((seconds) => <button key={seconds} type="button" onClick={() => setPollInterval(seconds)} className={cn('rounded-lg border px-1 py-2 text-xs transition-colors', pollInterval === seconds ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted')}>{seconds}s</button>)}</div></div>
              <Button className="w-full" type="submit" disabled={!validAddress || monitor.status === 'loading'}>{monitor.status === 'loading' ? <LoaderCircle className="animate-spin" /> : <RadioTower />}{active || snapshot ? '重新开始监控' : '开始监控'}</Button>
              {active ? <Button className="w-full" type="button" variant="outline" onClick={monitor.stop}><Square />停止监控</Button> : null}
            </form>

            {savedTargets.length > 0 ? (
              <div className="mt-5 border-t pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">已保存地址</p>
                  <span className="text-xs text-muted-foreground">点击即可监控</span>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {savedTargets.map((target) => {
                    const selected = snapshot?.address === target.address && snapshot.network === target.network;
                    const editing = editingTargetId === target.id;
                    return (
                      <div key={target.id} className={cn('rounded-xl border p-2', selected && 'border-emerald-500/35 bg-emerald-500/5')}>
                        {editing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              autoFocus
                              className="h-8"
                              value={editingLabel}
                              maxLength={30}
                              onChange={(event) => setEditingLabel(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') saveTargetLabel(target);
                                if (event.key === 'Escape') setEditingTargetId(null);
                              }}
                              aria-label={`重命名 ${compactAddress(target.address)}`}
                            />
                            <Button size="sm" type="button" onClick={() => saveTargetLabel(target)}>保存</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                              onClick={() => void startMonitoring(target.address, target.network, target.pollInterval)}
                              disabled={monitor.status === 'loading'}
                            >
                              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full bg-muted', selected && 'bg-emerald-500/10 text-emerald-600')}>
                                {selected ? <RadioTower className="size-3.5" /> : <Play className="size-3.5" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{target.label}</span>
                                <span className="block truncate font-mono text-[11px] text-muted-foreground">{compactAddress(target.address)} · {target.network === 'mainnet' ? '主网' : '测试网'} · {target.pollInterval}s</span>
                              </span>
                            </button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              type="button"
                              aria-label={`重命名 ${target.label}`}
                              onClick={() => {
                                setEditingTargetId(target.id);
                                setEditingLabel(target.label);
                              }}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`删除 ${target.label}`}
                              onClick={() => persistSavedTargets(savedTargets.filter((item) => item.id !== target.id))}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <section className="min-w-0 space-y-4">
          <div className={cn('rounded-xl border px-4 py-3', status.className)}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background/70"><StatusIcon className={cn('size-4', monitor.status === 'loading' && 'animate-spin')} /></span><div className="min-w-0"><p className="font-semibold">{status.label}</p><p className="truncate text-xs opacity-80">{status.description}</p></div></div>{snapshot ? <div className="flex items-center gap-2"><span className="text-xs opacity-75">更新于 {formatTime(snapshot.fetchedAt)}</span><Button size="icon-sm" variant="ghost" aria-label="立即刷新" onClick={() => void monitor.refresh()} disabled={monitor.status === 'loading'}><RefreshCw /></Button></div> : null}</div></div>

          {snapshot ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="账户净值" value={formatUsd(snapshot.accountValue)} hint={snapshot.network === 'mainnet' ? 'Hyperliquid 主网' : 'Hyperliquid 测试网'} /><Metric label="已用保证金" value={formatUsd(snapshot.totalMarginUsed)} hint="官方 clearinghouseState" /><Metric label="可提取余额" value={formatUsd(snapshot.withdrawable)} hint="不是自动跟单额度" /><Metric label="当前记录" value={`${snapshot.positions.length} 仓位 · ${snapshot.orders.length} 挂单`} hint={`交易所时间 ${formatTime(snapshot.exchangeTimeMs)}`} /></div>
            <Card className="gap-0 py-0"><Tabs value={tab} onValueChange={(value) => setTab(String(value))}><div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 pt-3"><TabsList variant="line"><TabsTrigger value="positions">仓位 <Badge variant="secondary">{snapshot.positions.length}</Badge></TabsTrigger><TabsTrigger value="orders">挂单 <Badge variant="secondary">{snapshot.orders.length}</Badge></TabsTrigger><TabsTrigger value="events">变化 <Badge variant="secondary">{monitor.events.length}</Badge></TabsTrigger></TabsList><p className="pb-2 font-mono text-xs text-muted-foreground" title={snapshot.address}>{compactAddress(snapshot.address)}</p></div><TabsContent value="positions"><PositionTable positions={snapshot.positions} /></TabsContent><TabsContent value="orders"><OrderTable orders={snapshot.orders} /></TabsContent><TabsContent value="events"><EventList events={monitor.events} /></TabsContent></Tabs></Card>
          </> : <Card><EmptyState icon={monitor.status === 'error' ? AlertTriangle : RadioTower} title={monitor.status === 'error' ? '暂时无法读取该地址' : '点击开始监控后读取数据'} description={monitor.error ?? '页面不会在后台服务器创建任务，关闭或离开页面即停止轮询。'} /></Card>}
        </section>
      </div>

      <CopyTradePanel key={snapshot ? `${snapshot.network}:${snapshot.address}` : 'empty'} snapshot={snapshot} events={monitor.events} />
      <TradeConnections />
    </div>
  );
}
