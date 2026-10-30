'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { ChevronDown, X } from 'lucide-react';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import type { AssetCategoryDetail, ClassificationAsset } from '@/lib/portfolio/assetCategories';
import { CHART_SERIES } from '@/lib/theme/colors';
import { tokenIconUrl } from '@/lib/portfolio/assetIconSource';
import { stockIconUrl } from '@/lib/portfolio/stockIcons';
import { AssetCategoryManager } from './AssetCategoryManager';
import { TokenIcon } from './TokenIcon';
import { buildTopHoldings, formatAllocationUsd } from '@/lib/portfolio/topHoldings';

const CustomAllocationPie = dynamic(() => import('./CustomAllocationPie').then(module => module.CustomAllocationPie), {
  ssr: false,
  loading: () => <div className="aspect-square w-full rounded-full bg-muted/30" />,
});
const AllocationTopHoldings = dynamic(() => import('./AllocationTopHoldings').then(module => module.AllocationTopHoldings), {
  ssr: false, loading: () => <div className="h-[140px] animate-pulse rounded-lg bg-muted/30" />,
});
const AllocationStreamgraph = dynamic(() => import('./AllocationStreamgraph').then(module => module.AllocationStreamgraph), {
  ssr: false, loading: () => <div className="h-[140px] animate-pulse rounded-lg bg-muted/30" />,
});

export interface AllocationItem {
  id?: string;
  label: string;
  value: number;
  color?: string;
  details?: AssetCategoryDetail[];
}

const FALLBACK_COLORS = CHART_SERIES;
const colorFor = (item: AllocationItem, index: number) => item.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];

function shareLabel(percentage: number) {
  if (percentage > 0 && percentage < 0.01) return '<0.01%';
  return `${percentage.toFixed(Math.abs(percentage) < 0.1 && percentage !== 0 ? 2 : 1)}%`;
}

function AllocationHoverCard({ anchor, interactive, children, ...props }: {
  anchor: RefObject<HTMLElement | null>;
  interactive: boolean;
  children: ReactNode;
  id: string;
  'aria-label': string;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const card = cardRef.current;
      const bounds = anchor.current?.getBoundingClientRect();
      if (!card || !bounds) return;
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      // Keep the compact chart's controls reachable on narrow screens.
      const beside = bounds.left >= width + 20;
      const left = beside ? bounds.left - width - 12 : bounds.right - width;
      const top = beside ? bounds.top + 44
        : bounds.bottom + height + 16 <= window.innerHeight ? bounds.bottom + 8
          : bounds.top - height - 8 >= 8 ? bounds.top - height - 8 : bounds.top + 44;
      card.style.left = `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`;
      card.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    };
    place();
    const resize = new ResizeObserver(place);
    if (cardRef.current) resize.observe(cardRef.current);
    if (anchor.current) resize.observe(anchor.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);
  return createPortal(<div {...props} ref={cardRef} role="region" data-allocation-hover-card
    className={`fixed z-50 max-h-[calc(100dvh-16px)] w-[360px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg ${interactive ? '' : 'pointer-events-none'}`}>
    {children}
  </div>, document.body);
}

/**
 * Visual reference: Lieflat Charts G13 · Big Slice (Custom Pie).
 * Angle encodes the exact asset share; radius encodes relative category value.
 * Template attribution and license: docs/third-party/lieflat-charts.md.
 */
export function AssetAllocationPie({ breakdown, assets, totalAssetsValue }: { breakdown: AllocationItem[]; assets: ClassificationAsset[]; totalAssetsValue: number }) {
  const { hidden, percentHidden } = usePrivacyFormat();
  const fmtUsd = (value: number) => hidden ? '******' : formatAllocationUsd(value);
  const detailId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [detailReplayKey, setDetailReplayKey] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [detailView, setDetailView] = useState<'trend' | 'holdings'>('holdings');
  const topHoldings = useMemo(() => buildTopHoldings(breakdown, totalAssetsValue), [breakdown, totalAssetsValue]);
  const positive = useMemo(() => breakdown.filter(item => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value).map((item, index) => ({ ...item, color: colorFor(item, index) })), [breakdown]);
  const negative = breakdown.filter(item => Number.isFinite(item.value) && item.value < 0).sort((a, b) => a.value - b.value);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  const activeLabel = hovered ?? focused ?? pinned;
  const active = [...positive, ...negative].find(item => item.label === activeLabel && item.details?.some(detail => Number.isFinite(detail.value) && detail.value !== 0));
  const rankedDetails = active?.details?.filter(detail => Number.isFinite(detail.value) && detail.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value)) ?? [];
  const details = rankedDetails.slice(0, 8);
  const toggle = (label: string) => { setPinned(pinned === label ? null : label); setHovered(null); setFocused(null); };
  const close = () => { setPinned(null); setHovered(null); setFocused(null); };

  const row = (item: AllocationItem, index: number, isNegative = false) => {
    const canExpand = item.details?.some(detail => Number.isFinite(detail.value) && detail.value !== 0);
    const expanded = active?.label === item.label;
    const percentage = total > 0 ? item.value / total * 100 : 0;
    const content = <>
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(item, index) }} />
          <span className="min-w-0 break-words text-left text-xs font-medium">{item.label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
          <span className={`text-xs font-semibold tracking-tight ${isNegative ? '' : 'hidden @min-[420px]:inline'}`}>{fmtUsd(item.value)}</span>
          {!isNegative && <span className="w-12 text-right text-xs text-muted-foreground">{percentHidden ? '**%' : shareLabel(percentage)}</span>}
          {canExpand && <ChevronDown aria-hidden="true" className={`size-3 text-muted-foreground transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />}
        </span>
      </span>

    </>;
    return <li key={item.label} data-allocation-category={item.label} className="min-w-0">
      {canExpand ? <button type="button" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}
        onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(item.label); }}
        onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(null); }}
        onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setFocused(item.label); }}
        onBlur={() => setFocused(null)}
        onClick={() => toggle(item.label)}
        className={`block w-full rounded-lg px-0 py-1 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none @min-[320px]:px-2.5 ${expanded ? 'bg-muted/40' : ''}`}>{content}</button>
        : <div className="px-0 py-1 @min-[320px]:px-2.5">{content}</div>}
    </li>;
  };

  return <><section ref={sectionRef} aria-label="资产分布" className="@container w-full min-w-0"
    onPointerLeave={() => setHovered(null)} onKeyDown={event => { if (event.key === 'Escape') close(); }}>
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-sm font-semibold tracking-tight">资产分布</h2>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <span>按分类汇总</span><span>· USD</span>
        </div>
      </div>
      <AssetCategoryManager assets={assets} />
    </div>
    {positive.length > 0 ? <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 @min-[320px]:grid-cols-[120px_minmax(0,1fr)] @min-[420px]:grid-cols-[140px_minmax(0,1fr)] @min-[420px]:gap-3">
      <div className="w-[96px] shrink-0 @min-[320px]:w-[120px] @min-[420px]:w-[140px]">
        <CustomAllocationPie items={positive} activeLabel={active?.label ?? null} replayKey={replayKey} onHover={setHovered}
          onReplay={() => { close(); setReplayKey(key => key + 1); }} />
      </div>
      <ol className="space-y-px" aria-label="正值资产分类">{positive.map((item, index) => row(item, index))}</ol>
    </div> : <p className="rounded-lg border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">暂无正值资产数据</p>}
    {negative.length > 0 && <div className="mt-2 border-t pt-2">
      <p className="mb-1 text-[11px] text-muted-foreground">负值分类 · 占比按正值分类合计计算</p>
      <ul aria-label="负值资产分类">{negative.map((item, index) => row(item, index, true))}</ul>
    </div>}
    {active && <AllocationHoverCard anchor={sectionRef} id={detailId} aria-label={`${active.label} 分类明细`} interactive={pinned === active.label}
      onKeyDown={event => { if (event.key === 'Escape') close(); }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="break-words text-xs font-semibold">{active.label}<span className="ml-2 font-normal text-muted-foreground">{rankedDetails.length} 项</span></p><p className="mt-1 text-xs tabular-nums text-muted-foreground"><span className="font-semibold text-foreground underline underline-offset-2">{fmtUsd(active.value)}</span>{pinned === active.label ? ' · 已固定' : ''}</p></div>
        {pinned === active.label && <button type="button" aria-label="关闭分类明细" onClick={close} className="-mr-1 -mt-1 rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" /></button>}
      </div>
      <ul className="space-y-1.5">
        {details.map(detail => <li key={detail.id ?? detail.label} data-allocation-detail={detail.label} className="flex items-start justify-between gap-3 text-xs">
          <span className="min-w-0 text-muted-foreground">
            <span className="flex min-w-0 items-start gap-1.5">
              <span className="min-w-0 break-words leading-relaxed">{detail.displayLabel ?? detail.label}</span>
              {detail.icon && <span className="mt-0.5 shrink-0" data-allocation-icon>
                <TokenIcon key={`${detail.icon.src ?? ''}:${detail.icon.market ?? ''}:${detail.icon.symbol}`}
                  symbol={detail.icon.symbol} size={16}
                  src={detail.icon.src ?? (detail.icon.market
                    ? stockIconUrl(detail.icon.market, detail.icon.symbol)
                    : tokenIconUrl(detail.icon.symbol))}
                  fallbackSrc={detail.icon.market ? stockIconUrl(detail.icon.market, detail.icon.symbol) : tokenIconUrl(detail.icon.symbol)} />
              </span>}
            </span>
            {detail.merged && detail.locations && detail.locations.length > 0 &&
              <span data-allocation-locations className="mt-0.5 block break-words text-[10px] leading-4 text-muted-foreground/70">{detail.locations.join(' · ')}</span>}
          </span>
          <span className="shrink-0 text-right tabular-nums"><span className="font-medium">{fmtUsd(detail.value)}</span>{active.value > 0 && <span className="mt-0.5 block text-[11px] text-muted-foreground">{percentHidden ? '**%' : shareLabel(detail.value / active.value * 100)}</span>}</span>
        </li>)}
      </ul>
      {rankedDetails.length > 8 && <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">仅显示金额绝对值最大的 8 项</p>}
    </AllocationHoverCard>}
  </section>
    <section data-allocation-data-view aria-label="资产分布数据视图" className="min-w-0 md:col-span-2 lg:col-span-1">
      <div className="mb-2">
        <select aria-label="资产分布视图" value={detailView} onChange={event => { close();setDetailView(event.target.value as 'trend' | 'holdings'); }}
          className="max-w-full rounded border-0 bg-transparent p-0 text-sm font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="holdings">前 6 大持仓</option><option value="trend">分布趋势</option>
        </select>
        <p className="mt-1 text-xs text-muted-foreground">{detailView === 'holdings' ? '占总资产' : '历史分类分布'} · USD</p>
      </div>
      {detailView === 'trend'
        ? <AllocationStreamgraph hidden={hidden} percentHidden={percentHidden} replayKey={detailReplayKey} onReplay={() => setDetailReplayKey(key => key + 1)} />
        : <AllocationTopHoldings model={topHoldings} hidden={hidden} percentHidden={percentHidden} replayKey={detailReplayKey} onReplay={() => setDetailReplayKey(key => key + 1)} />}
    </section>
  </>;
}
