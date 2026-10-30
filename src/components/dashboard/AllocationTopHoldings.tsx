'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { tokenIconUrl } from '@/lib/portfolio/assetIconSource';
import { stockIconUrl } from '@/lib/portfolio/stockIcons';
import { formatAllocationUsd, holdingDotScale, type buildTopHoldings } from '@/lib/portfolio/topHoldings';
import { TokenIcon } from './TokenIcon';

type Model = ReturnType<typeof buildTopHoldings>;
const share = (value: number) => value > 0 && value < .1 ? '<0.1%' : `${value.toFixed(1)}%`;

// L2 · Dot Cascade · "What breaks, stacked and ranked", lupi-gallery.html.
// Mirror the ranked columns to put the largest holding first; preserve the
// dotted diagonal baseline, unit dots, distinct top marker and pop stagger.
// Fractional dots encode continuous money by area; columns extend sideways.
export function AllocationTopHoldings({ model, hidden, percentHidden, replayKey, onReplay }: { model: Model; hidden: boolean; percentHidden: boolean; replayKey: number; onReplay: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null), innerRef = useRef<HTMLDivElement>(null), tipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900), [revealed, setRevealed] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const dots = useMemo(() => holdingDotScale(model.rows.map(row => row.value)), [model]);
  const hasRows = model.rows.length > 0;
  const columnWidth = Math.max(90, ...model.rows.map(row => (formatAllocationUsd(row.value).length + 6) * 6));
  const active = activeIndex === null ? undefined : model.rows[activeIndex];
  const money = (value: number) => hidden ? '******' : formatAllocationUsd(value);
  const percentage = (value: number) => percentHidden ? '**%' : share(value);
  const x = (index: number) => (index + .5) / model.rows.length * width;
  const base = (index: number) => 48 + index / Math.max(1, model.rows.length - 1) * 10;
  const inspect = (index: number, element: Element) => {
    const box = element.getBoundingClientRect();
    setAnchor({ x: box.left + box.width / 2, y: box.top + 18 });setActiveIndex(index);
  };
  useEffect(() => {
    const root = rootRef.current, inner = innerRef.current;
    if (!root || !inner) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setRevealed(true); observer.disconnect(); }
    }, { threshold: .2 });observer.observe(root);
    const resize = new ResizeObserver(() => { setWidth(inner.clientWidth);setActiveIndex(null); });resize.observe(inner);
    const hide = () => setActiveIndex(null);window.addEventListener('scroll', hide, true);
    return () => { observer.disconnect();resize.disconnect();window.removeEventListener('scroll', hide, true); };
  }, [hasRows]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !revealed) return;
    let live = true;
    const animations = [...root.querySelectorAll('[data-cascade-dot]')].flatMap(dot => dot.getAnimations()).filter(animation => animation.playState !== 'finished');
    root.dataset.animationState = animations.length ? 'entering' : 'ready';
    if (animations.length) void Promise.allSettled(animations.map(animation => animation.finished)).then(() => { if (live) root.dataset.animationState = 'ready'; });
    return () => { live = false; };
  }, [revealed, replayKey, model, width]);
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.left = `${Math.max(8, Math.min(anchor.x - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - tip.offsetHeight - 8))}px`;
  }, [active, anchor, hidden]);
  const replay = () => { setActiveIndex(null);onReplay(); };
  if (!model.rows.length) return <p className="py-6 text-center text-xs text-muted-foreground">暂无可展示的持仓标的</p>;
  return <div ref={rootRef} data-top-holdings data-chart-type="dot-cascade" data-replay-key={replayKey} data-animation-state="pending" role="group" tabIndex={0}
    aria-label={hidden ? '前六大非现金持仓点阵图，金额已隐藏，点击重播动画' : `前六大非现金持仓点阵图，每点 ${formatAllocationUsd(dots.unit)}，点击重播动画`}
    onClick={replay} onPointerLeave={() => setActiveIndex(null)}
    onKeyDown={event => { if (event.key === 'Escape') setActiveIndex(null);if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault();replay(); } }}
    className="h-[140px] min-w-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex h-[18px] items-start justify-between gap-3 text-[10px] text-muted-foreground">
      <span className="shrink-0 whitespace-nowrap">{hidden ? '金额已隐藏' : `每点 ${formatAllocationUsd(dots.unit)}`}</span>
      <span className="min-w-0 truncate text-right">前 {model.rows.length} 项 {money(model.topAbsoluteValue)} · 占总资产 {percentage(model.totalAssetsValue > 0 ? model.topAbsoluteValue / model.totalAssetsValue * 100 : 0)}</span>
    </div>
    <div data-top-holdings-scroll className="overflow-x-auto overflow-y-hidden overscroll-x-contain" onScroll={() => setActiveIndex(null)}>
      <div ref={innerRef} style={{ minWidth: model.rows.length * columnWidth }} className={revealed ? 'holding-cascade-reveal' : 'holding-cascade-pending'}>
        <svg key={`${replayKey}:${dots.unit}`} aria-hidden="true" viewBox={`0 0 ${width} 66`} className="block h-[66px] w-full">
          <line x1={x(0) - 12} x2={x(model.rows.length - 1) + 12} y1={base(0) + 4} y2={base(model.rows.length - 1) + 4}
            stroke="var(--border)" strokeWidth={1} strokeDasharray="2 4" />
          {model.rows.map((row, index) => <g key={row.id} onPointerEnter={event => { if (event.pointerType === 'mouse') inspect(index, event.currentTarget); }}>
            <rect x={index / model.rows.length * width} y={0} width={width / model.rows.length} height={66} fill="transparent" />
            {dots.fractions[index].map((fraction, k, fractions) => {
              const top = k === fractions.length - 1, cy = base(index) - 6 - k * 4 - (top ? 2 : 0);
              return <g key={k} data-cascade-dot data-dot-fraction={fraction} className="holding-cascade-dot" style={{ animationDelay: `${index * .05 + k * .03}s` }}>
                {top && <circle cx={x(index)} cy={cy} r={3.4} fill="var(--card)" stroke={index === 0 ? 'var(--primary)' : 'var(--foreground)'} strokeWidth={.8} />}
                <circle cx={x(index)} cy={cy} r={1.5 * Math.sqrt(fraction)} fill={index === 0 ? 'var(--primary)' : top ? 'var(--foreground)' : 'var(--muted-foreground)'} />
              </g>;
            })}
          </g>)}
        </svg>
        <ol aria-label="前六大非现金持仓排名" className="grid h-[46px]" style={{ gridTemplateColumns: `repeat(${model.rows.length}, minmax(0, 1fr))` }}>
          {model.rows.map((row, index) => {
            const lookup = row.icon ? row.icon.market ? stockIconUrl(row.icon.market, row.icon.symbol) : tokenIconUrl(row.icon.symbol) : undefined;
            return <li key={row.id} data-top-holding={row.id} className="min-w-0 px-1">
              <button type="button" aria-label={`${row.label}，${money(row.value)}，点击重播动画`} onPointerEnter={event => { if (event.pointerType === 'mouse') inspect(index, event.currentTarget); }}
                onFocus={event => inspect(index, event.currentTarget)} onBlur={() => setActiveIndex(null)}
                className="block w-full min-w-0 rounded text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex h-[16px] min-w-0 items-center justify-center gap-1">
                  {row.icon && <TokenIcon src={row.icon.src ?? lookup} fallbackSrc={lookup} symbol={row.icon.symbol} size={14} />}
                  <span data-top-holding-name className="truncate text-[11px] font-medium">{row.label}</span>
                </span>
                <span className="block whitespace-nowrap text-[10px] leading-[14px] tabular-nums"><span data-top-holding-value className="font-semibold">{money(row.value)}</span> <span data-top-holding-share className="text-muted-foreground">{percentage(row.share)}</span></span>
                <span data-top-holding-locations className="block truncate text-[9px] leading-[12px] text-muted-foreground">{(row.locations ?? []).join(' · ')}</span>
              </button>
            </li>;
          })}
        </ol>
      </div>
    </div>
    {active && createPortal(<div ref={tipRef} data-top-holding-tooltip role="region" aria-label="持仓标的详情"
      className="pointer-events-none fixed z-50 w-[290px] max-w-[calc(100vw-16px)] rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="font-semibold">{active.label}</p><p className="mt-1 tabular-nums">{money(active.value)} · 占总资产 {percentage(active.share)}</p>
      <p className="mt-1 break-words text-muted-foreground">{(active.locations ?? []).join(' · ')}</p>
    </div>, document.body)}
    <style>{`
      @keyframes holding-cascade-pop { from { transform:scale(0) } to { transform:scale(1) } }
      .holding-cascade-pending .holding-cascade-dot { opacity:0 }
      .holding-cascade-reveal .holding-cascade-dot { transform-box:fill-box;transform-origin:center;animation:holding-cascade-pop .5s cubic-bezier(.2,.7,.3,1.3) both }
      @media(prefers-reduced-motion:reduce) { .holding-cascade-reveal .holding-cascade-dot { animation:none } }
    `}</style>
  </div>;
}
