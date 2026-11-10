'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { buildStackedRungsModel, buildCapacityAxis, CAPACITY_BASE, CAPACITY_HEIGHT } from '@/lib/accumulation/stackedRungs';
import { displayName, type DerivedTarget } from '@/lib/accumulation/derive';
import { sortTargets, type TargetSortKey } from '@/lib/accumulation/sort';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { formatCurrency } from '@/lib/format';
import { MARKET_CURRENCY } from '@/types/stocks';
import { cn } from '@/lib/utils';
import { StockLogo } from './StockLogo';
import { PriceAge } from '@/components/common/PriceAge';

const shareLabel = (value: number) => value.toLocaleString('zh-CN', { style: 'percent', maximumSignificantDigits: 3 });

// F7 · Stacked Rungs · templates/basics-gallery.html, C3,
// "Where each region's revenue sits". Keep one vertical ladder per asset,
// three bands with one-rung separators, deterministic rung widths/opacity,
// baseline and staggered reveal. Column heights share a total-asset scale;
// each rung is 1% of its own cap, and opacity represents current exposure.
export function TargetStackedRungsChart({ derived, totalPortfolioUsd, activeSector, activationKey }: {
  derived: DerivedTarget[]; totalPortfolioUsd: number; activeSector?: string | null; activationKey: number;
}) {
  const { fmtUsd, hidden, percentHidden } = usePrivacyFormat();
  const [sortKey, setSortKey] = useState<TargetSortKey>('currentValue');
  const rows = useMemo(() => sortTargets(derived, sortKey, sortKey === 'symbol', activeSector), [derived, sortKey, activeSector]);
  const model = useMemo(() => buildStackedRungsModel(rows, totalPortfolioUsd), [rows, totalPortfolioUsd]);
  const axis = useMemo(() => buildCapacityAxis(percentHidden ? [1] : model.map(row => row.limit)), [model, percentHidden]);
  const rootRef = useRef<HTMLDivElement>(null), tipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900), [revealed, setRevealed] = useState(false), [replayKey, setReplayKey] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null), [focused, setFocused] = useState<string | null>(null), [pinned, setPinned] = useState<string | null>(null);
  const [tipPosition, setTipPosition] = useState({ left: 8, top: 8 });
  const tooltipId = useId();
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = new ResizeObserver(entries => setWidth(Math.max(320, entries[0].contentRect.width)));
    resize.observe(root);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setRevealed(true); observer.disconnect(); }
    }, { threshold: .1 });
    observer.observe(root);
    return () => { resize.disconnect(); observer.disconnect(); };
  }, []);
  const active = model.find(row => row.target.target.id === (hovered ?? focused ?? pinned));
  const close = () => { setHovered(null); setFocused(null); setPinned(null); };
  const replay = () => { close(); setReplayKey(key => key + 1); };
  const locate = (x: number, y: number) => setTipPosition({ left: Math.max(8, Math.min(x + 14, window.innerWidth - 356)), top: Math.max(8, Math.min(y + 14, window.innerHeight - 376)) });
  const entersTip = (target: EventTarget | null) => target instanceof Node && !!tipRef.current?.contains(target);
  const contentWidth = Math.max(width, 60 + rows.length * 80);
  const columnWidth = (contentWidth - 60) / Math.max(1, rows.length);
  const halfWidth = Math.max(13, Math.min(26, columnWidth * .17));
  const shades = ['var(--positive)', 'var(--warning)', 'var(--negative)'];
  const percent = (value: number | null) => percentHidden ? '**%' : value === null ? '—' : shareLabel(value);
  const local = (value: number | null, target: DerivedTarget) => hidden ? '******' : value === null ? '—' : formatCurrency(value, MARKET_CURRENCY[target.target.market]);
  const d = active?.target;
  const quantityText = d?.quantities.map(q => `${hidden ? '******' : q.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${q.unit}${q.label ? ` ${q.label}` : ''}`).join(' / ') || '—';
  const gapUsd = active?.gap !== null && active?.gap !== undefined && Number.isFinite(totalPortfolioUsd) ? active.gap * totalPortfolioUsd : null;
  return <div className="min-w-0 rounded-lg border bg-card" data-target-stacked-rungs>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>仓位上限 · 占总资产 · 非线性刻度</span>
          {['30%', '40%', '30%'].map((label, index) => <span key={index} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: shades[index] }} />{label}</span>)}
        </div>
      </div>
      <select aria-label="图表排序" value={sortKey} onChange={event => { setSortKey(event.target.value as TargetSortKey); close(); }} className="rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <option value="currentValue">仓位从大到小</option><option value="pnlUsd">盈亏从高到低</option><option value="changePct">今日涨跌从高到低</option><option value="symbol">标的名称</option>
      </select>
    </div>
    <div ref={rootRef} role="group" aria-label="AI 仓位堆叠刻度图，点击重播动画" tabIndex={0} data-replay-key={`${activationKey}:${replayKey}`}
      className="min-w-0 cursor-pointer rounded-b-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={replay} onKeyDown={event => {
        if (event.key === 'Escape') close();
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); replay(); }
      }}>
      {rows.length === 0 ? <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">暂无加仓标的</div> : <div data-stacked-scroll className="overflow-x-auto overscroll-contain" onScroll={() => setHovered(null)}>
        <svg key={`${activationKey}:${replayKey}`} width={contentWidth} height={CAPACITY_HEIGHT} role="group" aria-label="各标的三段仓位上限，30%、40%、30%，非线性纵轴" className={cn('block', revealed ? 'stacked-reveal' : 'stacked-pending')}>
          {axis.ticks.map(({ value, y }) => <g key={value} data-capacity-axis-tick aria-hidden>
            <line x1={38} x2={contentWidth - 10} y1={y} y2={y} stroke="var(--border)" strokeWidth={.7} strokeDasharray={value === 0 ? undefined : '2 5'} />
            <text x={30} y={y + 3} textAnchor="end" fontSize={9} fill="var(--muted-foreground)">{percentHidden ? '**%' : shareLabel(value)}</text>
          </g>)}
          {model.map((row, index) => {
            const target = row.target, id = target.target.id, name = displayName(target.target.market, target.target.symbol, target.name);
            const x = 44 + (index + .5) * columnWidth, delay = Math.min(index, 7) * .09;
            const visualLimit = percentHidden ? 1 : row.limit;
            const top = visualLimit !== null ? axis.y(visualLimit) : CAPACITY_BASE - axis.height * .3;
            const chosen = active?.target.target.id === id, dimmed = !!activeSector && (target.target.sector || '未分类') !== activeSector;
            return <g key={id} data-stacked-asset={target.target.symbol} data-column-height={CAPACITY_BASE - top} role="button" tabIndex={0} aria-label={`${name}，查看持仓详情，点击重播动画`} aria-describedby={chosen ? tooltipId : undefined}
              className="outline-none" opacity={dimmed ? .35 : 1}
              onPointerEnter={event => { if (event.pointerType === 'mouse') { setHovered(id); locate(event.clientX, event.clientY); } }}
              onPointerLeave={event => { if (!entersTip(event.relatedTarget)) setHovered(null); }}
              onFocus={event => { setFocused(id); const box = event.currentTarget.getBoundingClientRect(); locate(box.left + box.width / 2, box.top + 50); }} onBlur={() => setFocused(null)}
              onClick={event => { event.stopPropagation(); setPinned(id); setReplayKey(key => key + 1); }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setPinned(id); setReplayKey(key => key + 1); } }}>
              <rect x={x - columnWidth / 2 + 1} y={1} width={columnWidth - 2} height={CAPACITY_HEIGHT - 2} rx={5} fill={chosen ? 'var(--muted)' : 'transparent'} stroke={chosen ? 'var(--ring)' : 'none'} strokeWidth={.7} />
              {row.limit !== null ? <>
                {row.rungs.map(rung => {
                  const limit = visualLimit ?? 0;
                  const lowerY = axis.y(limit * rung.unit / 100), upperY = axis.y(limit * (rung.unit + 1) / 100);
                  const y = axis.y(limit * (rung.unit + .5) / 100);
                  return <line key={rung.unit} data-stacked-rung data-band={rung.band} x1={x - halfWidth - rung.widthJitter} x2={x + halfWidth + rung.widthJitter} y1={y} y2={y} stroke={shades[rung.band]} strokeWidth={Math.min(1, (lowerY - upperY) * .5)}
                    opacity={percentHidden || row.progress === null ? .3 : .18 + rung.fraction * (rung.opacity - .18)} className="stacked-fade" style={{ animationDelay: `${delay + rung.unit * .012}s` }} />;
                })}
              </> : <>
                <rect x={x - halfWidth} y={top} width={halfWidth * 2} height={CAPACITY_BASE - top} rx={3} stroke="var(--border)" fill="none" strokeWidth={1} strokeDasharray="3 4" />
                <text x={x} y={top + (CAPACITY_BASE - top) / 2} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)">未设置</text>
              </>}
              {!percentHidden && (row.overLimit || row.belowZero || row.current === null) && <text x={x} y={Math.max(44, top - 28)} textAnchor="middle" fontSize={10} fill={row.overLimit || row.belowZero ? 'var(--negative)' : 'var(--muted-foreground)'}>{row.overLimit ? '超限' : row.belowZero ? '负仓位' : '待估值'}</text>}
              <foreignObject x={x - 10} y={CAPACITY_BASE + 16} width={20} height={20}><StockLogo market={target.target.market} symbol={target.target.symbol} /></foreignObject>
              <text x={x} y={CAPACITY_BASE + 52} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--foreground)" className="stacked-fade" style={{ animationDelay: `${delay}s` }}>{name.length > 7 ? `${name.slice(0, 6)}…` : name}</text>
              <text x={x} y={CAPACITY_BASE + 71} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">当前 {percent(row.current)}</text>
              <text x={x} y={CAPACITY_BASE + 88} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">{row.limit === null ? '未设上限' : `上限 ${percent(row.limit)}`}</text>
            </g>;
          })}
        </svg>
      </div>}
    </div>
    {active && d && createPortal(<div ref={tipRef} id={tooltipId} role="region" aria-label="AI 仓位详情" data-stacked-tooltip className="fixed z-50 overflow-y-auto rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg" style={{ ...tipPosition, width: 'min(340px, calc(100vw - 16px))', maxHeight: 'min(360px, calc(100vh - 16px))' }} onPointerLeave={() => setHovered(null)} onKeyDown={event => { if (event.key === 'Escape') close(); }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold"><StockLogo market={d.target.market} symbol={d.target.symbol} />{displayName(d.target.market, d.target.symbol, d.name)}</div>
        <button type="button" aria-label="关闭持仓详情" onClick={close} className="rounded p-0.5 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
      </div>
      <p className="mb-3 mt-1 text-muted-foreground">{d.target.symbol} · {d.target.sector || '未分类'}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 tabular-nums">
        <dt className="text-muted-foreground">现有仓位</dt><dd className="text-right font-medium">{fmtUsd(d.currentValue)}</dd>
        <dt className="text-muted-foreground">占总资产</dt><dd className="text-right">{percent(active.current)}</dd>
        <dt className="text-muted-foreground">仓位上限</dt><dd className="text-right">{active.limit === null ? '未设置' : percent(active.limit)}</dd>
        <dt className="text-muted-foreground">{active.overLimit ? '已超出额度' : '距上限额度'}</dt><dd className={cn('text-right', active.overLimit && 'text-negative')}>{gapUsd === null ? '—' : fmtUsd(Math.abs(gapUsd))}</dd>
        <dt className="text-muted-foreground">浮动盈亏</dt><dd className={cn('text-right', d.pnlUsd !== null && (d.pnlUsd >= 0 ? 'text-positive' : 'text-negative'))}>{d.pnlUsd === null ? '—' : fmtUsd(d.pnlUsd)}{d.pnlPct !== null && <span className="ml-1">({percentHidden ? '**%' : `${d.pnlPct > 0 ? '+' : ''}${d.pnlPct.toFixed(1)}%`})</span>}</dd>
        <dt className="text-muted-foreground">今日涨跌</dt><dd className="text-right">{d.changePct === null ? '—' : percentHidden ? '**%' : `${d.changePct > 0 ? '+' : ''}${d.changePct.toFixed(2)}%`}</dd>
        <dt className="text-muted-foreground">现价 / 成本价</dt><dd className="text-right">{local(d.livePrice, d)} / {local(d.costBasisLocal, d)}</dd>
        <dt className="text-muted-foreground">数量</dt><dd className="break-words text-right">{quantityText}</dd>
      </dl>
      {!!d.holdingSources?.length && <p className="mt-3 break-words border-t pt-2 text-muted-foreground">{d.holdingSources.join(' / ')}</p>}
      <div className="mt-2"><PriceAge updatedAt={d.priceUpdatedAt} source={d.priceSource} status={d.priceStatus} /></div>
    </div>, document.body)}
    <style>{`
      @keyframes target-stacked-fade { from { opacity:0 } }
      .stacked-pending .stacked-fade { opacity:0 }
      .stacked-reveal .stacked-fade { animation:target-stacked-fade .8s cubic-bezier(.16,1,.3,1) both }
      @media(prefers-reduced-motion:reduce) { .stacked-reveal .stacked-fade { animation:none } }
    `}</style>
  </div>;
}
