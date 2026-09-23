'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock3, Coins, Database, RefreshCw, ServerCrash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime, formatDecimalString } from '@/lib/cryptoSentry/format';
import { cn } from '@/lib/utils';
import type { MonitorSnapshot, SnapshotStatus } from '@/types/cryptoSentry';

const STATUS: Record<SnapshotStatus, { label: string; className: string }> = {
  warming_up: { label: '首次同步中', className: 'text-blue-600' },
  ok: { label: '运行正常', className: 'text-emerald-600' },
  empty: { label: '暂无数据', className: 'text-muted-foreground' },
  partial: { label: '部分可用', className: 'text-amber-600' },
  stale: { label: '数据已过期', className: 'text-orange-600' },
  error: { label: '采集失败', className: 'text-destructive' },
  unsupported: { label: '暂不支持', className: 'text-muted-foreground' },
};
const STABLECOIN_SYMBOLS = new Set(['USDC', 'USDT', 'DAI', 'USDS', 'USDG']);
const DISTRIBUTION_SEGMENTS = Array.from({ length: 31 }, (_, index) => index);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.flatMap((item) => record(item) ? [item as Record<string, unknown>] : []) : [];
}
function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return value.toLocaleString('zh-CN');
  if (value === 'unavailable') return '暂不可用';
  if (typeof value === 'string') return /^-?\d+(\.\d+)?$/.test(value) ? formatDecimalString(value, 8) : value;
  return JSON.stringify(value);
}
function label(key: string): string {
  const labels: Record<string, string> = {
    positionCount: '仓位数', positionAssetCount: '资产数', failedPositionCount: '读取失败', eventCount: '近期事件',
    scannedChainCount: '扫描网络', successfulChainCount: '成功网络', failedChainCount: '失败网络', positionChainCount: '仓位网络',
    totalCollateralBase: '总抵押', totalDebtBase: '总债务', availableBorrowsBase: '可借额度', healthFactor: '健康因子',
    currentTick: '当前 Tick', activeLiquidity: '活跃流动性', tvlUsd: 'TVL (USD)', price: '价格', dataAgeSeconds: '数据年龄',
    inRangeCount: '区间内仓位', outOfRangeCount: '区间外仓位', aggregateValueUsd: '总价值 (USD)', aggregateFeesUsd: '累计费用 (USD)', valuationCoverage: '估值状态',
  };
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

function KeyValues({ value, limit = 12 }: { value: Record<string, unknown>; limit?: number }) {
  const entries = Object.entries(value).filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) || item === null).slice(0, limit);
  if (!entries.length) return null;
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{entries.map(([key, item]) => <div key={key} className="min-w-0 rounded-lg bg-muted/55 px-3 py-2.5"><p className="truncate text-xs text-muted-foreground" title={key}>{label(key)}</p><p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums" title={display(item)}>{display(item)}</p></div>)}</div>;
}

function AavePositions({ positions }: { positions: Array<Record<string, unknown>> }) {
  return <div className="space-y-3">{positions.map((position, index) => {
    const account = record(position.account) ?? {};
    const assets = list(position.assets);
    const infinite = account.healthFactorInfinite === true;
    return <Card key={`${String(position.chainId)}-${index}`} className="gap-0 py-0"><CardHeader className="border-b py-4"><div className="flex items-center justify-between"><CardTitle>{String(position.chainName ?? 'Aave Position')}</CardTitle><Badge variant="outline">区块 {String(position.blockNumber ?? '—')}</Badge></div></CardHeader><CardContent className="space-y-4 py-4"><div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><div className="rounded-lg bg-muted/55 px-3 py-2.5"><p className="text-xs text-muted-foreground">健康因子</p><p className={cn('mt-1 font-mono text-lg font-bold', infinite ? 'text-emerald-600' : 'text-foreground')}>{infinite ? '∞' : display(account.healthFactor)}</p>{infinite ? <p className="text-xs text-emerald-600">无借款</p> : null}</div><KeyValues value={{ totalCollateralBase: account.totalCollateralBase, totalDebtBase: account.totalDebtBase, availableBorrowsBase: account.availableBorrowsBase }} limit={3} /></div>{assets.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="pb-2">资产</th><th className="pb-2 text-right">存入</th><th className="pb-2 text-right">债务</th><th className="pb-2 text-right">存入价值</th><th className="pb-2 text-right">债务价值</th><th className="pb-2 text-right">抵押</th></tr></thead><tbody>{assets.map((asset, assetIndex) => <tr key={String(asset.assetAddress ?? assetIndex)} className="border-b last:border-0"><td className="py-2 font-medium">{String(asset.symbol ?? '—')}</td><td className="py-2 text-right font-mono">{display(asset.suppliedAmount)}</td><td className="py-2 text-right font-mono">{display(asset.totalDebtAmount)}</td><td className="py-2 text-right font-mono">{display(asset.suppliedBase)}</td><td className="py-2 text-right font-mono">{display(asset.debtBase)}</td><td className="py-2 text-right">{display(asset.usageAsCollateral)}</td></tr>)}</tbody></table></div> : null}</CardContent></Card>;
  })}</div>;
}

function isClosedPosition(position: Record<string, unknown>): boolean {
  if (position.positionClosed === true) return true;
  return typeof position.liquidity === 'string' && /^0+(?:\.0+)?$/.test(position.liquidity);
}

function numberValue(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priceAtTick(tick: unknown, token0: Record<string, unknown>, token1: Record<string, unknown>): number | null {
  const currentTick = numberValue(tick);
  const token0Decimals = numberValue(token0.decimals);
  const token1Decimals = numberValue(token1.decimals);
  if (currentTick === null || token0Decimals === null || token1Decimals === null || Math.abs(currentTick) > 500_000) return null;
  const price = Math.pow(1.0001, currentTick) * Math.pow(10, token0Decimals - token1Decimals);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function formatApproximatePrice(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 }).format(value);
}

function formatFeeTier(position: Record<string, unknown>): string | null {
  const fee = numberValue(position.version === 'v4' ? position.lpFee : position.feeTier);
  if (fee === null) return null;
  return `${Number((fee / 10_000).toFixed(4))}%`;
}

function formatUsd(value: unknown): string {
  return typeof value === 'string' ? `US$${formatDecimalString(value, 2)}` : '—';
}

function isStablecoin(symbol: unknown): boolean {
  return typeof symbol === 'string' && STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
}

function UsdValue({ value, availableLabel, unavailableLabel }: { value: unknown; availableLabel: string; unavailableLabel: string }) {
  const available = typeof value === 'string';
  return <div className="min-w-0">
    <p className={cn('truncate tabular-nums', available ? 'text-xl font-semibold tracking-tight' : 'text-base font-medium text-muted-foreground')}>{available ? formatUsd(value) : '待估值'}</p>
    <p className="mt-1 truncate text-xs text-muted-foreground">{available ? availableLabel : unavailableLabel}</p>
  </div>;
}

function UniPositions({ positions }: { positions: Array<Record<string, unknown>> }) {
  const [showClosed, setShowClosed] = useState(false);
  const activePositions = positions.filter((position) => !isClosedPosition(position));
  const closedCount = positions.length - activePositions.length;
  const visiblePositions = showClosed ? positions : activePositions;

  return <section className="overflow-hidden rounded-2xl border bg-background shadow-[0_1px_2px_rgb(15_23_42/0.03)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/[0.28] px-5 py-3.5">
      <div className="flex items-baseline gap-2.5"><h3 className="font-semibold tracking-tight">LP 仓位</h3><p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{activePositions.length}</span> 个活跃{closedCount > 0 ? <span> · {closedCount} 个已关闭</span> : null}</p></div>
      {closedCount > 0 ? <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowClosed((value) => !value)}>{showClosed ? '隐藏已关闭仓位' : `查看已关闭仓位（${closedCount}）`}</Button> : null}
    </div>
    {visiblePositions.length > 0 ? <>
      <div className="hidden grid-cols-[minmax(200px,1.1fr)_minmax(225px,1.25fr)_minmax(235px,1.15fr)_minmax(145px,.7fr)_minmax(130px,.65fr)] gap-4 bg-muted/[0.5] px-5 py-3 text-sm font-medium text-muted-foreground xl:grid">
        <p>资金池</p><p>头寸</p><p>分布</p><p className="text-right">价值</p><p className="text-right">费用</p>
      </div>
      <div className="divide-y">{visiblePositions.map((position, index) => {
      const token0 = record(position.token0) ?? {};
      const token1 = record(position.token1) ?? {};
      const reversePair = isStablecoin(token0.symbol) && !isStablecoin(token1.symbol);
      const baseToken = reversePair ? token1 : token0;
      const quoteToken = reversePair ? token0 : token1;
      const baseAmount = reversePair ? position.token1Amount : position.token0Amount;
      const quoteAmount = reversePair ? position.token0Amount : position.token1Amount;
      const pair = `${String(baseToken.symbol ?? 'Token0')} / ${String(quoteToken.symbol ?? 'Token1')}`;
      const closed = isClosedPosition(position);
      const rawLowerPrice = priceAtTick(position.tickLower, token0, token1);
      const rawUpperPrice = priceAtTick(position.tickUpper, token0, token1);
      const lowerPrice = reversePair && rawLowerPrice !== null && rawUpperPrice !== null
        ? Math.min(1 / rawLowerPrice, 1 / rawUpperPrice) : rawLowerPrice;
      const upperPrice = reversePair && rawLowerPrice !== null && rawUpperPrice !== null
        ? Math.max(1 / rawLowerPrice, 1 / rawUpperPrice) : rawUpperPrice;
      const lowerTick = numberValue(position.tickLower);
      const upperTick = numberValue(position.tickUpper);
      const currentTick = numberValue(position.currentTick);
      const rawRangeProgress = lowerTick !== null && upperTick !== null && currentTick !== null && upperTick > lowerTick
        ? Math.max(0, Math.min(100, ((currentTick - lowerTick) / (upperTick - lowerTick)) * 100)) : null;
      const rangeProgress = rawRangeProgress === null ? null : reversePair ? 100 - rawRangeProgress : rawRangeProgress;
      const feeTier = formatFeeTier(position);
      return <article key={`${String(position.chainId)}-${String(position.version)}-${String(position.tokenId ?? index)}`} className={cn('grid grid-cols-2 gap-x-4 gap-y-5 px-5 py-5 transition-colors hover:bg-muted/[0.18] xl:grid-cols-[minmax(200px,1.1fr)_minmax(225px,1.25fr)_minmax(235px,1.15fr)_minmax(145px,.7fr)_minmax(130px,.65fr)] xl:items-center', closed && 'bg-muted/[0.22] opacity-70')}>
        <div className="col-span-2 min-w-0 xl:col-span-1">
          <p className="mb-2 text-xs font-medium text-muted-foreground xl:hidden">资金池</p>
          <div className="flex items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/60 text-foreground"><Coins className="size-[18px]" strokeWidth={1.75} /></div><div className="min-w-0"><p className="truncate text-[17px] font-semibold tracking-tight">{pair}</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{String(position.version ?? 'v3').toUpperCase()}</span>{feeTier ? <><span className="text-border">•</span><span>{feeTier}</span></> : null}<span className="text-border">•</span><span className="font-mono">#{String(position.tokenId ?? '—')}</span></p></div></div>
        </div>
        <div className="col-span-2 min-w-0 xl:col-span-1">
          <p className="mb-2 text-xs font-medium text-muted-foreground xl:hidden">头寸</p>
          <p className="truncate text-[17px] font-semibold tracking-tight tabular-nums">{formatApproximatePrice(lowerPrice)} <span className="mx-0.5 text-muted-foreground">→</span> {formatApproximatePrice(upperPrice)} <span className="text-sm font-medium text-muted-foreground">{String(quoteToken.symbol ?? '')}</span></p>
          <p className={cn('mt-1.5 flex items-center gap-1.5 text-sm font-medium', closed ? 'text-muted-foreground' : position.inRange === true ? 'text-emerald-600' : 'text-amber-600')}><Circle className="size-2.5 fill-current" />{closed ? '已关闭' : position.inRange === true ? '在范围内' : position.inRange === false ? '范围外' : '范围未知'}</p>
        </div>
        <div className="col-span-2 min-w-0 xl:col-span-1">
          <p className="mb-2 text-xs font-medium text-muted-foreground xl:hidden">分布</p>
          {rangeProgress === null ? <p className="text-sm text-muted-foreground">暂无价格区间进度</p> : <><div className="mb-1 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">价格区间位置</span><span className="font-mono text-xs font-semibold tabular-nums text-foreground">{rangeProgress.toFixed(1)}%</span></div><div className="flex h-1.5 items-center gap-[3px]" role="progressbar" aria-label={`${pair} 价格区间位置`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rangeProgress)}>{DISTRIBUTION_SEGMENTS.map((segment) => <span key={segment} className={cn('h-full min-w-0 flex-1 rounded-[1px]', ((segment + 0.5) / DISTRIBUTION_SEGMENTS.length) * 100 <= rangeProgress ? 'bg-lime-700/80' : 'bg-foreground/75')} />)}</div><div className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground"><span className="truncate">{formatDecimalString(typeof baseAmount === 'string' ? baseAmount : null, 4)} {String(baseToken.symbol ?? '')}</span><span className="truncate text-right">{formatDecimalString(typeof quoteAmount === 'string' ? quoteAmount : null, 4)} {String(quoteToken.symbol ?? '')}</span></div></>}
        </div>
        <div className="min-w-0 xl:text-right"><p className="mb-2 text-xs font-medium text-muted-foreground xl:hidden">价值</p><UsdValue value={position.positionValueUsd} availableLabel="链上估值" unavailableLabel="后端暂未返回 USD 估值" /></div>
        <div className="min-w-0 xl:text-right"><p className="mb-2 text-xs font-medium text-muted-foreground xl:hidden">费用</p><UsdValue value={position.feesValueUsd} availableLabel="可用费用估值" unavailableLabel={position.feeStatus === 'tokens_owed_recorded_only' ? '仅记录待领取费用' : '后端暂未返回费用估值'} /></div>
      </article>;
    })}</div></> : <div className="p-8 text-center"><p className="text-sm font-medium">当前没有活跃 LP 仓位</p><p className="mt-1 text-xs text-muted-foreground">已关闭仓位默认隐藏，不会影响新仓位监控。</p></div>}
  </section>;
}

function snapshotErrorText(code: string, message: string): string {
  if (code === 'UNISWAP_POSITION_READ_FAILED') {
    return '本轮未能完整读取 Uniswap 仓位，已读取数据仍会展示，后端将在下一个采样周期自动重试。';
  }
  return message;
}

function Events({ events }: { events: Array<Record<string, unknown>> }) {
  if (!events.length) return null;
  return <Card><CardHeader><CardTitle>近期链上事件</CardTitle></CardHeader><CardContent className="divide-y">{events.slice(0, 30).map((event, index) => <div key={String(event.eventId ?? index)} className="grid gap-2 py-3 text-sm sm:grid-cols-[150px_1fr_auto]"><div><Badge variant="outline">{String(event.eventType ?? event.name ?? 'event')}</Badge><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(typeof event.observedAt === 'string' ? event.observedAt : null)}</p></div><p className="min-w-0 truncate font-mono text-xs text-muted-foreground">{String(event.symbol ?? event.resourceId ?? event.transactionHash ?? '')}</p><p className="font-mono tabular-nums">{display(event.usdAmount ?? event.tokenAmount ?? event.amount0 ?? event.value)}</p></div>)}</CardContent></Card>;
}

export function SnapshotPanel({ snapshot, loading, fetching, error, onRefresh }: { snapshot?: MonitorSnapshot; loading: boolean; fetching: boolean; error: Error | null; onRefresh: () => void }) {
  if (loading && !snapshot) return <div className="space-y-3"><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  if (!snapshot) return <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><ServerCrash className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">无法读取快照</p><p className="mt-1 text-sm text-muted-foreground">{error?.message ?? '后端尚未返回数据'}</p><Button className="mt-4" variant="outline" onClick={onRefresh}><RefreshCw />重试</Button></CardContent></Card>;
  const status = STATUS[snapshot.status];
  const positions = list(snapshot.data.positions);
  const events = list(snapshot.data.recentEvents);
  const metrics = list(snapshot.data.metrics);
  const pool = record(snapshot.data.pool);
  const volumes = list(snapshot.data.volumes);
  const marketDataAgeMetric = snapshot.monitorType === 'market'
    ? metrics.find((metric) => metric.name === 'data_age_seconds')
    : undefined;
  const marketDataAgeSeconds = numberValue(marketDataAgeMetric?.value);
  const displayedDataAgeSeconds = marketDataAgeSeconds ?? snapshot.dataAgeSeconds;
  const dataAgeLabel = marketDataAgeSeconds === null ? '数据年龄' : '行情数据年龄';
  const StatusIcon = snapshot.status === 'ok' ? CheckCircle2 : snapshot.status === 'warming_up' ? Clock3 : snapshot.status === 'error' ? ServerCrash : AlertTriangle;
  const isAave = snapshot.monitorType.startsWith('aave');

  return <div className="space-y-4">
    {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">刷新失败，继续展示上次数据：{error.message}</p> : null}
    <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="rounded-lg border p-2"><StatusIcon className={cn('size-5', status.className, snapshot.status === 'warming_up' && 'animate-pulse')} /></div><div><CardTitle>{status.label}</CardTitle><p className="mt-1 text-sm text-muted-foreground">快照 {formatDateTime(snapshot.observedAt)} · {dataAgeLabel} {displayedDataAgeSeconds === null ? '—' : `${formatDecimalString(String(displayedDataAgeSeconds), 3)}s`}</p></div></div><Button variant="outline" size="sm" onClick={onRefresh} disabled={fetching}><RefreshCw className={fetching ? 'animate-spin' : undefined} />刷新</Button></div></CardHeader><CardContent className="space-y-3"><KeyValues value={snapshot.summary} />{snapshot.error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span className="font-mono text-xs">{snapshot.error.code}</span><span className="mt-1 block">{snapshotErrorText(snapshot.error.code, snapshot.error.message)}</span></p> : null}{!snapshot.capability.available ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{snapshot.capability.reason ?? '当前能力暂不可用'}</p> : null}</CardContent></Card>
    {pool ? <Card><CardHeader><CardTitle>Pool 快照</CardTitle></CardHeader><CardContent className="space-y-3"><KeyValues value={pool} />{volumes.length ? <div><p className="mb-2 text-sm font-medium">滚动成交量</p><div className="grid gap-2 md:grid-cols-2">{volumes.map((volume, index) => <div key={String(volume.windowSeconds ?? index)} className="rounded-lg border p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">窗口 {display(volume.windowSeconds)} 秒</p><KeyValues value={volume} /></div>)}</div></div> : null}</CardContent></Card> : null}
    {metrics.length ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-4" />最新指标</CardTitle></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{metrics.map((metric, index) => <div key={`${String(metric.name)}-${index}`} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{String(metric.name ?? 'metric')}</p><p className="mt-1 font-mono font-semibold">{display(metric.value)} <span className="text-xs font-normal text-muted-foreground">{String(metric.unit ?? '')}</span></p></div>)}</div></CardContent></Card> : null}
    {positions.length ? isAave ? <AavePositions positions={positions} /> : <UniPositions key={snapshot.monitorId} positions={positions} /> : null}
    <Events events={events} />
  </div>;
}
