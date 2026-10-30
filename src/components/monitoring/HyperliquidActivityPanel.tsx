'use client';

import { Activity, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { formatDateTime, formatDecimalString } from '@/lib/cryptoSentry/format';
import type { MonitorSnapshot } from '@/types/cryptoSentry';

const ACTION: Record<string, string> = { fill: '成交', order_opened: '挂单', order_canceled: '撤单', order_rejected: '订单拒绝', order_triggered: '条件单触发' };
const CONNECTION: Record<string, string> = { connected: '实时连接中', connecting: '正在连接', reconnecting: '断线重连中', paused: '已暂停', unknown: '连接状态待确认' };
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row)) : [];
const time = (value: unknown) => {
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(ms) ? formatDateTime(new Date(ms).toISOString()) : '—';
};

export function HyperliquidActivityPanel({ snapshot, fetching, error, onRefresh }: {
  snapshot: MonitorSnapshot; fetching: boolean; error: Error | null; onRefresh: () => void;
}) {
  const { hidden } = usePrivacyFormat();
  const { summary } = snapshot, activities = rows(snapshot.data.activities), orders = rows(snapshot.data.openOrders);
  const connection = error ? 'unknown' : String(summary.connection ?? 'connecting');
  const connected = connection === 'connected', Icon = connected ? Wifi : WifiOff;
  const number = (value: unknown) => hidden ? '******' : value === undefined || value === null ? '—' : formatDecimalString(String(value), 8);
  return <div className="space-y-4" data-hyperliquid-activity>
    <Card className="gap-0 py-0"><CardContent className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><span className="rounded-full bg-muted p-2.5"><Icon className="size-5" /></span><div className="min-w-0"><p className="font-semibold" data-hyperliquid-connection>{CONNECTION[connection] ?? connection}</p><p className="mt-1 text-xs text-muted-foreground">Hyperliquid {summary.network === 'testnet' ? '测试网' : '主网'} · 官方实时活动订阅</p></div></div>
        <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={fetching} aria-label="刷新快照"><RefreshCw className={fetching ? 'animate-spin' : undefined} /></Button>
      </div>
      <p className="break-all font-mono text-xs text-muted-foreground">{String(summary.walletAddress ?? '—')}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>本次监控开始 {time(summary.sessionStartedAt)}</span><span>最近历史核对 {time(summary.lastSyncedAt)}</span></div>
      {error || snapshot.error ? <p role="status" className="rounded-lg bg-muted p-3 text-xs leading-relaxed">{error ? `暂时无法刷新状态：${error.message}` : snapshot.error?.message}</p> : null}
      {summary.recoveryNote ? <p className="text-xs leading-relaxed text-muted-foreground">{String(summary.recoveryNote)}</p> : null}
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4" />最近活动<Badge variant="secondary">{activities.length} 条</Badge></CardTitle><p className="text-xs text-muted-foreground">展示最近 50 条真实活动；补查记录按原始发生时间排列。</p></CardHeader><CardContent>
      {activities.length ? <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr className="border-b text-muted-foreground"><th className="pb-2 pr-4 font-medium">时间</th><th className="pb-2 pr-4 font-medium">活动</th><th className="pb-2 pr-4 font-medium">标的 / 方向</th><th className="pb-2 pr-4 text-right font-medium">数量</th><th className="pb-2 pr-4 text-right font-medium">价格</th><th className="pb-2 font-medium">订单</th></tr></thead><tbody>
        {activities.map((row, index) => <tr key={String(row.id ?? index)} data-hyperliquid-event={String(row.type)} className="border-b last:border-0">
          <td className="py-3 pr-4 tabular-nums">{time(row.timestamp)}</td><td className="py-3 pr-4"><span className="font-medium">{ACTION[String(row.type)] ?? String(row.type)}</span>{row.recovered === true && <span className="ml-1.5 text-[10px] text-muted-foreground">补查</span>}</td>
          <td className="py-3 pr-4"><span className="font-semibold">{String(row.coin)}</span><span className="ml-2 text-muted-foreground">{row.side === 'buy' ? '买入' : '卖出'} · {row.marketType === 'spot' ? '现货' : '永续'}</span></td>
          <td className="py-3 pr-4 text-right font-mono tabular-nums">{number(row.size)}</td><td className="py-3 pr-4 text-right font-mono tabular-nums">{number(row.price)}</td><td className="py-3 font-mono text-muted-foreground">{String(row.orderId)}</td>
        </tr>)}
      </tbody></table></div> : <p className="py-8 text-center text-sm text-muted-foreground">{connection === 'paused' ? '监控已暂停' : connected ? '等待新的成交、挂单或撤单活动' : '连接并核对历史后显示活动'}</p>}
    </CardContent></Card>
    <Card><CardContent className="pt-4"><details><summary className="cursor-pointer text-sm font-medium">当前挂单 · {Number(summary.openOrderCount ?? orders.length)} 笔</summary>
      {orders.length ? <div className="mt-3 space-y-2">{orders.slice(0, 50).map((order, index) => <div key={String(order.oid ?? index)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"><span className="font-medium">{String(order.coin)} · {order.side === 'B' ? '买入' : '卖出'}</span><span className="font-mono tabular-nums">数量 {number(order.sz)} · 价格 {number(order.limitPx)}</span><span className="text-muted-foreground">#{String(order.oid)}</span></div>)}</div> : <p className="mt-3 text-xs text-muted-foreground">暂无挂单记录</p>}
    </details></CardContent></Card>
  </div>;
}
