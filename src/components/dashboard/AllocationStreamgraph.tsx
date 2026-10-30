'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAllocationHistory } from '@/hooks/useAllocationHistory';
import { useVaultStore } from '@/stores/vaultStore';
import { useAssetCategoryStore } from '@/stores/assetCategoryStore';
import { assetCategoryColor } from '@/lib/theme/colors';
import { buildAllocationStream, streamGeometry, type AllocationStreamMode } from '@/lib/portfolio/allocationStream';
import { formatAllocationUsd } from '@/lib/portfolio/topHoldings';
import type { AllocationObservation } from '@/lib/portfolio/allocationHistory';

const EMPTY: AllocationObservation[] = [];
const RANGES = [{ id: 'day', label: '日', days: 1 }, { id: 'week', label: '周', days: 7 }, { id: 'month', label: '月', days: 30 }, { id: 'year', label: '年', days: 365 }, { id: 'all', label: '全部', days: Infinity }];
const percentage = (value: number) => value > 0 && value < .1 ? '<0.1%' : `${value.toFixed(1)}%`;

// F16 · Stream Ribbon · "Three products trade the same river", upstream basics-gallery.html.
// Keep silhouette stacking, proportional ribbon width, quadratic boundaries,
// paper seams, widest-band labels, barcode time floor and staggered fades.
export function AllocationStreamgraph({ hidden, percentHidden, replayKey, onReplay }: { hidden: boolean; percentHidden: boolean; replayKey: number; onReplay: () => void }) {
  const wallet = useVaultStore(state => state.address), history = useAllocationHistory(wallet);
  const definitions = useAssetCategoryStore(state => state.categories);
  const categories = useMemo(() => definitions.map(category => ({ id: category.id, label: category.name, color: assetCategoryColor(category) })), [definitions]);
  const [range, setRange] = useState('month'), [mode, setMode] = useState<AllocationStreamMode>('amount');
  const [width, setWidth] = useState(800), [revealed, setRevealed] = useState(false), [selected, setSelected] = useState<number | null>(null);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null), tipRef = useRef<HTMLDivElement>(null);
  const points = history.data?.points ?? EMPTY;
  const model = useMemo(() => {
    const now = Date.now();
    return buildAllocationStream(points, categories, now - RANGES.find(item => item.id === range)!.days * 86400000, mode, now);
  }, [points, categories, range, mode]);
  const geometry = useMemo(() => streamGeometry(model, width), [model, width]);
  const active = selected === null ? undefined : model.points[selected];
  const canDraw = model.series.length > 0 && model.segments.some(segment => segment.length >= 2);
  const money = (value: number) => hidden ? '******' : formatAllocationUsd(value);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = new ResizeObserver(() => { setWidth(root.clientWidth);setSelected(null); });resize.observe(root);
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setRevealed(true);observer.disconnect(); } }, { threshold: .2 });observer.observe(root);
    const hide = () => setSelected(null);window.addEventListener('scroll', hide, true);
    return () => { resize.disconnect();observer.disconnect();window.removeEventListener('scroll', hide, true); };
  }, []);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !revealed) return;
    let live = true;
    const animations = [...root.querySelectorAll('[data-stream-band]')].flatMap(band => band.getAnimations()).filter(animation => animation.playState !== 'finished');
    root.dataset.animationState = animations.length ? 'entering' : 'ready';
    if (animations.length) void Promise.allSettled(animations.map(animation => animation.finished)).then(() => { if (live) root.dataset.animationState = 'ready'; });
    return () => { live = false; };
  }, [revealed, replayKey, model]);
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.left = `${Math.max(8, Math.min(anchor.x - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - tip.offsetHeight - 8))}px`;
  }, [active, anchor, hidden, model]);
  const inspect = (index: number) => {
    const root = rootRef.current, point = model.points[index];
    if (!root || !point) return;
    const box = root.getBoundingClientRect(), next = { x: box.left + geometry.x(point.timestamp), y: box.top + 24 };
    setSelected(index);setAnchor(previous => previous.x === next.x && previous.y === next.y ? previous : next);
  };
  const replay = () => { setSelected(null);onReplay(); };
  const date = (timestamp: number) => new Date(timestamp).toLocaleString([], model.to - model.from < 86400000 ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' });
  const labels = geometry.ticks.filter((_, index, ticks) => index === 0 || index === ticks.length - 1 || index % Math.max(1, Math.ceil(ticks.length / 4)) === 0)
    .filter((tick, index, ticks) => index === 0 || tick.x - ticks[index - 1].x > 65);
  return <div ref={rootRef} data-allocation-stream data-stream-mode={mode} data-replay-key={replayKey} data-history-count={model.points.length} data-animation-state="pending"
    role="group" tabIndex={0} aria-label="资产分布历史趋势，左右方向键查看时间点，点击重播动画"
    onClick={replay} onPointerLeave={() => setSelected(null)} onFocus={event => { if (event.target === event.currentTarget && canDraw) inspect(model.points.length - 1); }}
    onKeyDown={event => {
      if (event.key === 'Escape') setSelected(null);
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault();replay(); }
      if (canDraw && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();inspect(event.key === 'Home' ? 0 : event.key === 'End' ? model.points.length - 1 : Math.max(0, Math.min(model.points.length - 1, (selected ?? model.points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
      }
    }} className="h-[140px] min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="flex h-[20px] items-center justify-between gap-2 text-[10px]">
      <div role="group" aria-label="分布趋势时间范围" className="flex items-center gap-0.5">
        {RANGES.map(item => <button key={item.id} type="button" aria-pressed={range === item.id} onClick={event => { event.stopPropagation();setSelected(null);setRange(item.id); }}
          className={`rounded px-1.5 py-0.5 ${range === item.id ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{item.label}</button>)}
      </div>
      <div role="group" aria-label="分布趋势度量" className="flex items-center gap-0.5">
        {(['amount', 'share'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={event => { event.stopPropagation();setSelected(null);setMode(value); }}
          className={`rounded px-1.5 py-0.5 ${mode === value ? 'bg-secondary font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{value === 'amount' ? '金额' : '占比'}</button>)}
      </div>
    </div>
    {history.data?.writeError || history.isError ? <div role="status" className="flex h-[100px] items-center justify-center text-xs text-muted-foreground">{history.data?.writeError ?? '分布历史暂时无法读取'}</div>
      : !canDraw ? <div data-allocation-stream-empty className="flex h-[100px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {history.isLoading ? '正在读取分布历史' : model.points.length < 2 ? '已开始记录资产分布，积累两个时间点后显示趋势' : model.segments.every(segment => segment.length < 2) ? '记录曾暂停，等待更多连续时间点形成趋势' : '当前区间暂无正值资产分布'}
      </div> : <svg key={`${replayKey}:${range}:${mode}`} viewBox={`0 0 ${width} 100`} aria-hidden="true" className={`block h-[100px] w-full cursor-pointer ${revealed ? 'allocation-stream-reveal' : 'allocation-stream-pending'}`}
        onPointerMove={event => {
          if (event.pointerType !== 'mouse') return;
          const box = event.currentTarget.getBoundingClientRect(), timestamp = model.from + Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (model.to - model.from);
          let lo = 0, hi = model.points.length - 1;
          while (lo < hi) { const mid = Math.floor((lo + hi) / 2);if (model.points[mid].timestamp < timestamp) lo = mid + 1;else hi = mid; }
          inspect(lo > 0 && timestamp - model.points[lo - 1].timestamp < model.points[lo].timestamp - timestamp ? lo - 1 : lo);
        }}>
        {geometry.bands.map((band, index) => <g key={band.id}>
          {band.paths.map((path, part) => <path key={part} data-stream-band={band.id} d={path} fill={band.color} stroke="var(--card)" strokeWidth={1.2} className="allocation-stream-band" style={{ animationDelay: `${index * .16}s` }} />)}
          {band.labelPosition && <text x={band.labelPosition.x} y={band.labelPosition.y + 3} textAnchor="middle" fill="var(--foreground)" stroke="var(--card)" strokeWidth={3} paintOrder="stroke" fontSize={9} fontWeight={600}>{band.label}</text>}
        </g>)}
        <line x1={4} x2={width - 4} y1={geometry.baseline} y2={geometry.baseline} stroke="var(--border)" strokeWidth={.8} />
        {geometry.ticks.map((tick, index) => <line key={index} x1={tick.x} x2={tick.x} y1={geometry.baseline} y2={geometry.baseline - (index % 8 === 0 ? 5 : 3)} stroke="var(--muted-foreground)" strokeWidth={.6} />)}
        {labels.map((tick, index) => <text key={tick.timestamp} x={tick.x} y={98} textAnchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'} fill="var(--muted-foreground)" fontSize={9}>{date(tick.timestamp)}</text>)}
        {active && <line data-stream-cursor x1={geometry.x(active.timestamp)} x2={geometry.x(active.timestamp)} y1={4} y2={geometry.baseline} stroke="var(--foreground)" strokeWidth={.7} strokeDasharray="2 3" />}
      </svg>}
    <div className="flex h-[20px] items-center gap-2 overflow-x-auto whitespace-nowrap text-[10px] text-muted-foreground" style={{ scrollbarWidth: 'none' }}>
      {model.series.map(category => <span key={category.id} data-stream-legend={category.id} className="inline-flex shrink-0 items-center gap-1"><span className="size-1.5 rounded-full" style={{ backgroundColor: category.color }} />{category.label}</span>)}
    </div>
    {active && createPortal(<div ref={tipRef} data-allocation-stream-tooltip role="region" aria-label="资产分布历史详情" className="pointer-events-none fixed z-50 w-[300px] max-w-[calc(100vw-16px)] rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg">
      <p className="font-semibold">{new Date(active.timestamp).toLocaleString()}</p><p className="mt-1 mb-2 text-muted-foreground">正值资产合计 <span className="font-semibold text-foreground">{money(active.total)}</span></p>
      {model.series.map(category => {
        const values = active.allocation.filter(row => category.other ? !model.series.some(series => !series.other && series.id === row.id) : category.id === row.id);
        const value = values.reduce((sum, row) => sum + Math.max(0, row.value), 0);
        return <div key={category.id} className="mt-1 flex justify-between gap-3"><span>{category.label}</span><span className="tabular-nums">{money(value)} · {percentHidden ? '**%' : percentage(active.total > 0 ? value / active.total * 100 : 0)}</span></div>;
      })}
      {active.allocation.some(row => row.value < 0) && <p className="mt-2 text-[10px] text-muted-foreground">负值分类单列：{active.allocation.filter(row => row.value < 0).map(row => `${row.label} ${money(row.value)}`).join(' · ')}</p>}
      {active.quality === 'estimated' && <p className="mt-2 text-[10px] text-muted-foreground">此时间点含缓存或部分估值</p>}
    </div>, document.body)}
    <style>{`
      @keyframes allocation-stream-fade { from { opacity:0 } }
      .allocation-stream-pending .allocation-stream-band { opacity:0 }
      .allocation-stream-reveal .allocation-stream-band { animation:allocation-stream-fade .9s ease both }
      @media(prefers-reduced-motion:reduce) { .allocation-stream-reveal .allocation-stream-band { animation:none } }
    `}</style>
  </div>;
}
