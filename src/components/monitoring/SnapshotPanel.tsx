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
const EVENT_LABELS: Record<string, string> = {
  swap: '兑换', mint: '增加流动性', burn: '移除流动性', collect: '领取手续费',
};
const METRIC_LABELS: Record<string, string> = {
  price: '最新价格', price_change_percent: '价格涨跌幅', base_volume_24h: '基础资产成交量（24 小时）',
  quote_volume_24h: '成交额（24 小时）', funding_rate_percent: '资金费率', next_funding_time: '下次资金费时间',
  open_interest: '未平仓量', open_interest_change_percent: '未平仓量变化率', data_age_seconds: '数据年龄',
  health_factor: '健康因子', health_factor_infinite: '健康因子无限', total_collateral_base: '总抵押价值',
  total_debt_base: '总债务价值', available_borrows_base: '可借额度', supplied_amount: '供应数量',
  total_debt_amount: '债务数量', usage_as_collateral: '是否作为抵押品',
  total_collateral_change_base: '抵押价值变化', total_collateral_change_percent: '抵押变化率',
  total_debt_change_base: '债务价值变化', total_debt_change_percent: '债务变化率',
  account_supply: '存入事件', account_withdraw: '提取事件', account_borrow: '借款事件', account_repay: '还款事件',
  account_liquidation: '清算事件', account_position_opened: '仓位开启', account_position_closed: '仓位关闭',
  aave_event_amount_token: 'Aave 事件代币数量', aave_event_amount_usd: 'Aave 事件金额',
  in_range: '是否在价格区间', current_tick: '当前 Tick', tick_lower: '区间下界 Tick', tick_upper: '区间上界 Tick',
  distance_to_lower_tick: '距下界 Tick', distance_to_upper_tick: '距上界 Tick',
  distance_to_nearest_boundary_percent: '距最近边界', liquidity: '流动性', token0_amount: 'Token0 数量',
  token1_amount: 'Token1 数量', fees_owed_token0: 'Token0 待领取手续费', fees_owed_token1: 'Token1 待领取手续费',
  position_value_usd: '仓位价值', fees_value_usd: '手续费价值', position_closed: '仓位已关闭', position_count: '仓位数',
  in_range_count: '区间内仓位数', out_of_range_count: '区间外仓位数', failed_position_count: '读取失败仓位数',
  aggregate_value_usd: '仓位总价值', aggregate_fees_usd: '手续费总价值', token0_price: 'Token0 价格',
  token1_price: 'Token1 价格', active_liquidity: '活跃流动性', tvl_token0: 'Token0 锁仓量', tvl_token1: 'Token1 锁仓量',
  tvl_usd: '锁仓价值', volume_token0: 'Token0 成交量', volume_token1: 'Token1 成交量',
  volume_usd: '成交额', volume_change_percent: '成交额变化率', swap: '兑换事件', mint: '增加流动性事件',
  burn: '移除流动性事件', fee_collection: '领取手续费事件', lp_fee: 'LP 费率', protocol_fee: '协议费率',
  block_number: '区块高度', pool_id: 'V4 Pool ID', tick_spacing: 'Tick 间隔',
};

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
  if (value === 'ok') return '可用';
  if (value === 'full') return '完整';
  if (value === 'partial') return '部分可用';
  if (value === 'protocol_parameters_only') return '仅协议参数';
  if (value === 'onchain_stablecoin_pool') return '链上稳定币池';
  if (typeof value === 'string') return /^-?\d+(\.\d+)?$/.test(value) ? formatDecimalString(value, 8) : value;
  return JSON.stringify(value);
}

function displayKeyValue(key: string, value: unknown): string {
  if (['lpFee', 'protocolFee', 'lp_fee', 'protocol_fee'].includes(key)) {
    const fee = numberValue(value);
    if (fee !== null) return `${Number((fee / 10_000).toFixed(4))}%`;
  }
  return display(value);
}
function label(key: string): string {
  const labels: Record<string, string> = {
    metricCount: '指标数量',
    positionCount: '仓位数', positionAssetCount: '资产数', failedPositionCount: '读取失败', eventCount: '近期事件',
    scannedChainCount: '扫描网络', successfulChainCount: '成功网络', failedChainCount: '失败网络', positionChainCount: '仓位网络',
    totalCollateralBase: '总抵押', totalDebtBase: '总债务', availableBorrowsBase: '可借额度', healthFactor: '健康因子',
    currentTick: '当前 Tick', activeLiquidity: '活跃流动性', tvlUsd: 'TVL (USD)', price: '价格', dataAgeSeconds: '数据年龄',
    chainId: '网络 ID', version: 'Uniswap 版本', poolAddress: 'V3 Pool 地址', poolId: 'V4 Pool ID',
    token0Price: 'Token0 价格', token1Price: 'Token1 价格', tvlToken0: 'Token0 锁仓量', tvlToken1: 'Token1 锁仓量',
    lpFee: 'LP 费率', protocolFee: '协议费率', feeStatus: '费率状态', valuationStatus: '估值状态',
    valuationSource: '估值来源', valuationObservedAt: '估值时间', tickSpacing: 'Tick 间隔', hooksAddress: 'Hooks 地址',
    inRangeCount: '区间内仓位', outOfRangeCount: '区间外仓位', aggregateValueUsd: '总价值 (USD)', aggregateFeesUsd: '累计费用 (USD)', valuationCoverage: '估值状态',
  };
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

function metricWindow(metric: Record<string, unknown>): string | null {
  const labels = record(metric.labels);
  const seconds = numberValue(labels?.windowSeconds);
  if (seconds === null) return null;
  if (seconds % 3_600 === 0) return `${seconds / 3_600} 小时`;
  if (seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function metricLabel(metric: Record<string, unknown>): string {
  const name = String(metric.name ?? 'metric');
  const translated = METRIC_LABELS[name] ?? name;
  const window = metricWindow(metric);
  const labels = record(metric.labels);
  const symbol = typeof labels?.symbol === 'string' ? labels.symbol : null;
  return `${translated}${window ? `（${window}）` : ''}${symbol ? ` · ${symbol}` : ''}`;
}

function metricUnit(metric: Record<string, unknown>): string {
  const unit = typeof metric.unit === 'string' ? metric.unit : '';
  const labels = record(metric.labels);
  const units: Record<string, string> = {
    percent: '%', seconds: '秒', contracts: '张', unix_milliseconds: '毫秒', ratio: '倍',
    base_currency: '基础计价单位', token: typeof labels?.symbol === 'string' ? labels.symbol : '代币',
    token0: typeof labels?.token0Symbol === 'string' ? labels.token0Symbol : 'Token0',
    token1: typeof labels?.token1Symbol === 'string' ? labels.token1Symbol : 'Token1',
    tick: 'Tick', liquidity: '流动性单位', positions: '个', boolean: '', USD: 'USD',
    base_asset: typeof labels?.baseAsset === 'string' ? labels.baseAsset : '基础资产',
    quote_asset: typeof labels?.quoteAsset === 'string' ? labels.quoteAsset : '计价资产',
  };
  if (unit) return units[unit] ?? unit;
  if (metric.name === 'price' && typeof labels?.quoteAsset === 'string') return labels.quoteAsset;
  return '';
}

function KeyValues({ value, limit = 12 }: { value: Record<string, unknown>; limit?: number }) {
  const entries = Object.entries(value).filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) || item === null).slice(0, limit);
  if (!entries.length) return null;
  return <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{entries.map(([key, item]) => { const displayed = displayKeyValue(key, item); return <div key={key} className="min-w-0 rounded-lg bg-muted/55 px-3 py-2.5"><p className="truncate text-xs text-muted-foreground" title={key}>{label(key)}</p><p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums" title={displayed}>{displayed}</p></div>; })}</div>;
}

function SummaryValues({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item) || item === null).slice(0, 6);
  if (!entries.length) return null;
  return <div className="flex flex-wrap gap-2">{entries.map(([key, item]) => <div key={key} className="flex items-baseline gap-2 rounded-full bg-muted/65 px-3 py-1.5"><span className="text-[11px] text-muted-foreground">{label(key)}</span><span className="font-mono text-xs font-semibold tabular-nums">{displayKeyValue(key, item)}</span></div>)}</div>;
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

function formatProtocolFee(value: unknown): string {
  const fee = numberValue(value);
  return fee === null ? '暂不可用' : `${Number((fee / 10_000).toFixed(4))}%`;
}

function technicalValue(value: unknown): string {
  return value === null || value === undefined || value === '' ? '暂不可用' : display(value);
}

function V4PositionDetails({ position }: { position: Record<string, unknown> }) {
  const hooksAddress = typeof position.hooksAddress === 'string' ? position.hooksAddress : null;
  const noHooks = hooksAddress !== null && /^0x0{40}$/i.test(hooksAddress);
  const items = [
    { label: 'Pool ID', value: technicalValue(position.poolId), mono: true },
    { label: '当前 Tick', value: technicalValue(position.currentTick), mono: true },
    { label: '流动性', value: technicalValue(position.liquidity), mono: true },
    { label: 'LP 费率', value: formatProtocolFee(position.lpFee), mono: true },
    { label: '协议费率', value: formatProtocolFee(position.protocolFee), mono: true },
    { label: 'Tick 间隔', value: technicalValue(position.tickSpacing), mono: true },
    { label: 'Hooks', value: noHooks ? '未配置' : technicalValue(hooksAddress), mono: true },
  ];
  return <div className="col-span-2 grid gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4 xl:col-span-5">{items.map((item) => <div key={item.label} className="min-w-0 rounded-lg bg-muted/45 px-3 py-2"><p className="text-xs text-muted-foreground">{item.label}</p><p className={cn('mt-1 truncate text-xs font-medium', item.mono && 'font-mono')} title={item.value}>{item.value}</p></div>)}</div>;
}

function DiscoveryProgress({ discovery }: { discovery: Record<string, unknown> | null }) {
  if (discovery === null) return null;
  const scanned = discovery.scannedThroughBlock;
  const tip = discovery.chainTipBlock;
  if ((typeof scanned !== 'string' && typeof scanned !== 'number') || (typeof tip !== 'string' && typeof tip !== 'number')) return null;
  const caughtUp = discovery.caughtUp === true;
  return <Card className={caughtUp ? 'border-emerald-500/20' : 'border-amber-500/30'}><CardContent className="py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">{caughtUp ? 'V4 索引已同步' : 'V4 首次同步中'}</p><p className="mt-1 text-xs text-muted-foreground">已同步至区块 <span className="font-mono text-foreground">{display(scanned)}</span></p></div><div className="text-right"><p className="text-xs text-muted-foreground">目标区块</p><p className="mt-1 font-mono text-sm font-semibold">{display(tip)}</p></div></div></CardContent></Card>;
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
        {position.version === 'v4' ? <V4PositionDetails position={position} /> : null}
      </article>;
    })}</div></> : <div className="p-8 text-center"><p className="text-sm font-medium">当前没有活跃 LP 仓位</p><p className="mt-1 text-xs text-muted-foreground">已关闭仓位默认隐藏，不会影响新仓位监控。</p></div>}
  </section>;
}

function snapshotErrorText(code: string, message: string): string {
  if (code === 'UNISWAP_POSITION_READ_FAILED') {
    return '本轮未能完整读取 Uniswap 仓位，已读取数据仍会展示，后端将在下一个采样周期自动重试。';
  }
  if (code === 'VALUATION_UNAVAILABLE') {
    return 'V4 仅凭 Pool ID 无法还原代币信息，因此 TVL、成交额和美元估值暂不可用；Tick、流动性、费率和池事件不受影响。';
  }
  if (code === 'INDEXER_PARTIAL_FAILURE') {
    return '本轮池事件同步未完成，已读取数据仍会展示，后端将在下一个采样周期自动重试。';
  }
  return message;
}

function Events({ events }: { events: Array<Record<string, unknown>> }) {
  if (!events.length) return null;
  return <Card><CardHeader><CardTitle>近期链上事件</CardTitle></CardHeader><CardContent className="divide-y">{events.slice(0, 30).map((event, index) => { const eventType = String(event.eventType ?? event.name ?? 'event'); return <div key={String(event.eventId ?? index)} className="grid gap-2 py-3 text-sm sm:grid-cols-[150px_1fr_auto]"><div><Badge variant="outline">{EVENT_LABELS[eventType] ?? eventType}</Badge><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(typeof event.observedAt === 'string' ? event.observedAt : null)}</p></div><p className="min-w-0 truncate font-mono text-xs text-muted-foreground">{String(event.symbol ?? event.resourceId ?? event.transactionHash ?? '')}</p><p className="font-mono tabular-nums">{display(event.usdAmount ?? event.tokenAmount ?? event.amount0 ?? event.value)}</p></div>; })}</CardContent></Card>;
}

export function SnapshotPanel({ snapshot, loading, fetching, error, onRefresh }: { snapshot?: MonitorSnapshot; loading: boolean; fetching: boolean; error: Error | null; onRefresh: () => void }) {
  if (loading && !snapshot) return <div className="space-y-3"><div className="h-28 animate-pulse rounded-xl bg-muted" /><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  if (!snapshot) return <Card><CardContent className="flex min-h-56 flex-col items-center justify-center text-center"><ServerCrash className="size-8 text-muted-foreground" /><p className="mt-3 font-medium">无法读取快照</p><p className="mt-1 text-sm text-muted-foreground">{error?.message ?? '后端尚未返回数据'}</p><Button className="mt-4" variant="outline" onClick={onRefresh}><RefreshCw />重试</Button></CardContent></Card>;
  const status = STATUS[snapshot.status];
  const positions = list(snapshot.data.positions);
  const events = list(snapshot.data.recentEvents);
  const metrics = list(snapshot.data.metrics);
  const pool = record(snapshot.data.pool);
  const discovery = record(snapshot.data.discovery);
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
    <Card className="gap-0 py-0"><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full bg-muted', status.className)}><StatusIcon className={cn('size-5', snapshot.status === 'warming_up' && 'animate-pulse')} /></div><div className="min-w-0"><p className="font-semibold">{status.label}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{formatDateTime(snapshot.observedAt)} · {dataAgeLabel} {displayedDataAgeSeconds === null ? '—' : `${formatDecimalString(String(displayedDataAgeSeconds), 3)}s`}</p></div></div><Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={fetching} aria-label="刷新快照"><RefreshCw className={fetching ? 'animate-spin' : undefined} /></Button></div><SummaryValues value={snapshot.summary} />{snapshot.error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><span className="font-mono text-xs">{snapshot.error.code}</span><span className="mt-1 block">{snapshotErrorText(snapshot.error.code, snapshot.error.message)}</span></p> : null}{!snapshot.capability.available ? <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{snapshot.capability.reason ?? '当前能力暂不可用'}</p> : null}</CardContent></Card>
    <DiscoveryProgress discovery={discovery} />
    {pool ? <Card><CardHeader><CardTitle>Pool 快照</CardTitle></CardHeader><CardContent className="space-y-3"><KeyValues value={pool} limit={16} />{volumes.length ? <div><p className="mb-2 text-sm font-medium">滚动成交量</p><div className="grid gap-2 md:grid-cols-2">{volumes.map((volume, index) => <div key={String(volume.windowSeconds ?? index)} className="rounded-lg border p-3"><p className="mb-2 text-xs font-medium text-muted-foreground">窗口 {display(volume.windowSeconds)} 秒</p><KeyValues value={volume} /></div>)}</div></div> : null}</CardContent></Card> : null}
    {metrics.length ? <Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600"><Database className="size-4" /></span>核心指标</CardTitle><Badge variant="secondary" className="rounded-full">{metrics.length} 项</Badge></div></CardHeader><CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{metrics.map((metric, index) => <div key={`${String(metric.name)}-${index}`} className="rounded-xl bg-muted/45 p-3.5 ring-1 ring-foreground/[0.06] transition-colors hover:bg-muted/65"><p className="text-[11px] font-medium text-muted-foreground">{metricLabel(metric)}</p><p className="mt-1.5 truncate font-mono text-base font-semibold tracking-tight tabular-nums" title={displayKeyValue(String(metric.name), metric.value)}>{displayKeyValue(String(metric.name), metric.value)}{metricUnit(metric) && !['lp_fee', 'protocol_fee'].includes(String(metric.name)) ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{metricUnit(metric)}</span> : null}</p></div>)}</div></CardContent></Card> : null}
    {positions.length ? isAave ? <AavePositions positions={positions} /> : <UniPositions key={snapshot.monitorId} positions={positions} /> : null}
    <Events events={events} />
  </div>;
}
