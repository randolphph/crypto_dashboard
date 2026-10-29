'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency, formatUsd } from '@/lib/format';
import { placeScatterLogos, SCATTER_LOGO_SIZE, scatterReturnAxis, scatterWeightAxis, type ScatterAxisMode, type buildIbkrScatter, type IbkrScatterPoint } from '@/lib/portfolio/ibkrScatter';
import { optionContract } from '@/lib/stocks/optionContract';
import { MARKET_LABEL } from '@/types/stocks';
import { TokenIcon } from './TokenIcon';
import { PriceAge } from '@/components/common/PriceAge';
import { stockIconUrl } from '@/lib/portfolio/stockIcons';

type Model = ReturnType<typeof buildIbkrScatter>;
const percent = (value: number) => {
  const magnitude = Math.abs(value);
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: magnitude > 0 && magnitude < .1 ? 4 : magnitude < 1 ? 2 : 1,
    notation: magnitude >= 1000 ? 'compact' : magnitude > 0 && magnitude < .0001 ? 'scientific' : 'standard' }).format(value)}%`;
};

// F8 · Plumb Scatter, basics-gallery.html · "Price against satisfaction".
// Keep hairline plumbs, barcode floor, best/worst labels and dot reveals.
// Both axes may use explicitly labelled nonlinear density scales.
// Both modes retain all holdings, with no jitter or invented return values.
export function IbkrScatter({ model, hidden, replayKey, onReplay }: { model: Model; hidden: boolean; replayKey: number; onReplay: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [revealed, setRevealed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [axisMode, setAxisMode] = useState<ScatterAxisMode>('density');
  const axis = useMemo(() => scatterWeightAxis(model.points.map(p => p.weight), axisMode), [model, axisMode]);
  const visible = model.points;
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = new ResizeObserver(entries => { const size = entries[0]?.contentRect.width; if (size) setWidth(size); });
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setRevealed(true); observer.disconnect(); }
    }, { threshold: .15 });
    resize.observe(root); observer.observe(root);
    return () => { resize.disconnect(); observer.disconnect(); };
  }, []);

  const height = 340, left = width < 500 ? 48 : 64, right = width - 24, top = 64, base = height - 48;
  const yScale = useMemo(() => scatterReturnAxis(model.points.map(p => p.pnlPct), axisMode), [model, axisMode]);
  const mapX = (weight: number) => left + axis.position(weight) * (right - left);
  const mapY = (value: number) => base - yScale.position(value) * (base - top);
  const logos = useMemo(() => placeScatterLogos(model.points.map(point => ({ id: point.position.id,
    x: left + axis.position(point.weight) * (right - left),
    y: base - yScale.position(point.pnlPct) * (base - top) })), width, left - 6), [model, axis, left, right, base, top, yScale, width]);
  const tickGap = Math.max(48, (right - left) / 8);
  const xTicks = axis.ticks.reduce<number[]>((ticks, tick) => {
    const x = mapX(tick), previous = ticks.at(-1);
    if (tick === 0 || tick === axis.max || (previous !== undefined && x - mapX(previous) >= tickGap && right - x >= tickGap)) ticks.push(tick);
    return ticks;
  }, []);
  const yTicks = [...new Set([0, yScale.min, yScale.max, ...yScale.ticks])].reduce<number[]>((ticks, tick) => {
    if (ticks.every(previous => Math.abs(mapY(tick) - mapY(previous)) >= 32)) ticks.push(tick);
    return ticks;
  }, []).sort((a, b) => a - b);
  const best = visible.reduce<IbkrScatterPoint | null>((a, b) => !a || b.pnlPct > a.pnlPct ? b : a, null);
  const worst = visible.reduce<IbkrScatterPoint | null>((a, b) => !a || b.pnlPct < a.pnlPct ? b : a, null);
  const active = visible.find(p => p.position.id === (hovered ?? focused));
  const nearby = active ? [active, ...visible.filter(p => p !== active
    && Math.hypot(mapX(p.weight) - mapX(active.weight), mapY(p.pnlPct) - mapY(active.pnlPct)) < 12)] : [];
  const close = () => { setHovered(null); setFocused(null); };
  const replay = () => { close(); onReplay(); };
  const money = (value: number | undefined) => hidden ? '******' : value !== undefined && Number.isFinite(value) ? formatUsd(value) : '—';
  const pct = (value: number) => hidden ? '**%' : percent(value);

  return <div ref={rootRef} data-ibkr-scatter data-replay-key={replayKey} data-scatter-view="all" data-axis-mode={axisMode}
    data-visible-count={visible.length} data-total-count={model.points.length} role="group" aria-label="IBKR 持仓散点图，点击重播动画" tabIndex={0}
    className="relative min-w-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={replay} onPointerLeave={() => setHovered(null)} onKeyDown={event => {
      if (event.key === 'Escape') close();
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); replay(); }
    }}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-sm font-medium">仓位与盈亏</p>
      <div className="flex items-center gap-4 text-xs text-muted-foreground" aria-label="持仓类型图例">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-foreground" />股票</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full border border-foreground bg-card" />期权</span>
      </div>
    </div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label="IBKR 坐标刻度" className="inline-flex items-center gap-1 rounded-md bg-muted/50 p-0.5">
        {(['density', 'linear'] as const).map(mode => <button key={mode} type="button" aria-pressed={axisMode === mode}
          onClick={event => { event.stopPropagation(); close(); setAxisMode(mode); }} className={`rounded px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${axisMode === mode ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
          {mode === 'density' ? '密集区放大' : '均匀刻度'}
        </button>)}
      </div>
      <p className="text-xs text-muted-foreground">全部 {model.points.length} 笔</p>
    </div>
    <svg key={`${replayKey}:${axisMode}`} viewBox={`0 0 ${width} ${height}`} className={`block h-[340px] w-full ${revealed ? 'ibkr-scatter-reveal' : 'ibkr-scatter-pending'}`}
      role="group" aria-label={`IBKR 持仓散点图：横轴为持仓占比${axis.nonlinear ? '，非线性刻度，密集区放大' : '，均匀刻度'}，纵轴为持仓盈亏率${yScale.nonlinear ? '，非线性刻度，密集区放大' : '，均匀刻度'}，全部有效持仓均显示`}>
      {yTicks.map(tick => <g key={tick}>
        <line data-scatter-zero-line={tick === 0 ? '' : undefined} x1={left} x2={right} y1={mapY(tick)} y2={mapY(tick)} stroke="var(--border)" strokeWidth={tick === 0 ? 1 : .6} strokeDasharray={tick === 0 ? undefined : '2 5'} />
        <text data-scatter-axis-value data-scatter-y-tick x={left - 10} y={mapY(tick) + 3.5} textAnchor="end" fill="var(--muted-foreground)" fontSize={10}>{pct(tick)}</text>
      </g>)}
      {Array.from({ length: 21 }, (_, i) => <line key={i} x1={left + i / 20 * (right - left)} x2={left + i / 20 * (right - left)}
        y1={base} y2={base + 3} stroke="var(--muted-foreground)" strokeWidth={.5} opacity={.5} />)}
      {xTicks.map(tick => <line key={tick} x1={mapX(tick)} x2={mapX(tick)} y1={base} y2={base + 7} stroke="var(--muted-foreground)" strokeWidth={.8} />)}
      <line x1={left - 6} x2={right + 6} y1={base} y2={base} stroke="var(--border)" strokeWidth={.8} />
      {xTicks.map(tick => <text key={tick} data-scatter-axis-value data-scatter-x-tick x={mapX(tick)} y={base + 22}
        textAnchor="middle" fill="var(--muted-foreground)" fontSize={10}>{pct(tick)}</text>)}
      <text data-scatter-y-label x={left} y={13} fill="var(--muted-foreground)" fontSize={11}>持仓盈亏率{yScale.nonlinear ? ' · 非线性' : ''}</text>
      <text x={right} y={height - 4} textAnchor="end" fill="var(--muted-foreground)" fontSize={11}>持仓占比{axis.nonlinear ? ' · 非线性' : ''} →</text>
      {visible.map((point, i) => {
        const { position, label } = point, x = mapX(point.weight), y = mapY(point.pnlPct);
        const logo = logos.get(position.id)!;
        const underlying = position.kind === 'option' ? optionContract(position).underlying ?? position.symbol : position.symbol;
        const shifted = Math.abs(logo.x + SCATTER_LOGO_SIZE / 2 - x) > 1 || y - logo.y - SCATTER_LOGO_SIZE > 12;
        const hero = point === best || point === worst, selected = nearby.includes(point), color = hero || selected ? 'var(--primary)' : 'var(--foreground)';
        const text = `${label.length > 24 ? `${label.slice(0, 22)}…` : label}${hidden ? '' : ` · ${percent(point.pnlPct)}`}`;
        const toLeft = x > (left + right) / 2, labelX = x + (toLeft ? -8 : 8);
        const labelY = point === worst && point !== best ? Math.min(base - 6, y + 19) : Math.max(20, logo.y - 6);
        const textWidth = text.length * 6.5, textLeft = toLeft ? labelX - textWidth : labelX;
        // Keep the brand marks legible in dense layouts; a colliding optional
        // best/worst caption remains available in the point's tooltip.
        const showLabel = hero && textLeft >= 4 && textLeft + textWidth <= width - 4 && [...logos.values()].every(box =>
          textLeft + textWidth + 2 <= box.x || textLeft >= box.x + SCATTER_LOGO_SIZE + 2 || labelY + 3 <= box.y || labelY - 12 >= box.y + SCATTER_LOGO_SIZE + 2);
        return <g key={position.id}>
          <line data-scatter-plumb x1={x} x2={x} y1={base} y2={y} stroke="var(--muted-foreground)" strokeWidth={.55}
            opacity={.6} className="ibkr-scatter-line" style={{ animationDelay: `${.2 + Math.min(i, 20) * .05}s` }} />
          <g data-scatter-point={position.id} data-instrument={position.kind ?? 'stock'} role="button" tabIndex={0}
            aria-label={`${label}，${position.shares < 0 ? '空头' : '多头'}，持仓占比 ${pct(point.weight)}，盈亏率 ${pct(point.pnlPct)}`}
            className="cursor-pointer outline-none"
            onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(position.id); }}
            onPointerLeave={() => setHovered(null)} onFocus={() => setFocused(position.id)} onBlur={() => setFocused(null)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); replay(); } }}>
            <circle cx={x} cy={y} r={width < 500 ? 18 : 12} fill="transparent" />
            {shifted && <line x1={x} y1={y - 7} x2={logo.x + SCATTER_LOGO_SIZE / 2} y2={logo.y + SCATTER_LOGO_SIZE}
              stroke="var(--muted-foreground)" strokeWidth={.6} opacity={.65} className="pointer-events-none" />}
            <rect x={logo.x} y={logo.y} width={SCATTER_LOGO_SIZE} height={SCATTER_LOGO_SIZE} fill="transparent" />
            <foreignObject data-scatter-logo={position.id} data-logo-symbol={underlying} aria-hidden="true"
              x={logo.x} y={logo.y} width={SCATTER_LOGO_SIZE} height={SCATTER_LOGO_SIZE} className="pointer-events-none ibkr-scatter-logo"
              style={{ animationDelay: `${.25 + Math.min(i, 20) * .05}s` }}>
              <div className="flex h-full w-full items-center justify-center rounded-full border border-border bg-white">
                <TokenIcon src={stockIconUrl(position.market, underlying)} symbol={underlying} size={16} />
              </div>
            </foreignObject>
            {selected && <circle cx={x} cy={y} r={10} fill="none" stroke="var(--primary)" strokeWidth={1} />}
            <circle data-scatter-dot cx={x} cy={y} r={hero ? 4.6 : 3.2} fill={position.kind === 'option' ? 'var(--card)' : color}
              stroke={color} strokeWidth={1.5} className="ibkr-scatter-dot" style={{ animationDelay: `${.25 + Math.min(i, 20) * .05}s` }} />
          </g>
          {showLabel && <text data-scatter-label x={labelX} y={labelY}
            textAnchor={toLeft ? 'end' : 'start'} fontSize={11} fontWeight={600} fill="var(--foreground)"
            stroke="var(--card)" strokeWidth={3} paintOrder="stroke" className="pointer-events-none ibkr-scatter-label">{text}</text>}
        </g>;
      })}
    </svg>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">占比按持仓绝对市值计算，不含现金。{model.points.some(p => p.position.kind === 'option') ? '期权使用权利金市值。' : ''}</p>
    {active && <div data-ibkr-scatter-tooltip role="region" aria-label="IBKR 持仓详情"
      className="pointer-events-none absolute z-30 max-h-[280px] w-[310px] max-w-[calc(100%-16px)] overflow-y-auto rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
      style={{ left: Math.max(8, Math.min(mapX(active.weight) + 12, width - 326)), top: Math.max(44, Math.min(mapY(active.pnlPct) + 30, 140)) }}>
      {nearby.length > 1 && <p className="mb-2 font-medium text-muted-foreground">此处 {nearby.length} 笔持仓</p>}
      {nearby.map((point, i) => {
        const p = point.position, underlying = p.kind === 'option' ? optionContract(p).underlying ?? p.symbol : p.symbol;
        const local = (value: number | undefined) => hidden ? '******' : value !== undefined && Number.isFinite(value) ? formatCurrency(value, p.currency) : '—';
        return <div key={p.id} className={i ? 'mt-3 border-t pt-3' : ''}>
          <div className="mb-1 flex items-center gap-1.5 pr-5 font-semibold"><TokenIcon src={stockIconUrl(p.market, underlying)} symbol={underlying} size={16} />{point.label}</div>
          <p className="mb-2 text-muted-foreground">{MARKET_LABEL[p.market]} · {p.kind === 'option' ? '期权' : '股票'} · {p.shares < 0 ? '空头' : '多头'}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 tabular-nums">
            <dt className="text-muted-foreground">市值 (USD)</dt><dd className="text-right font-medium">{money(p.marketValueUsd)}</dd>
            <dt className="text-muted-foreground">持仓占比</dt><dd className="text-right">{pct(point.weight)}</dd>
            <dt className="text-muted-foreground">持仓盈亏 (USD)</dt><dd className="text-right">{money(p.pnlUsd)}</dd>
            <dt className="text-muted-foreground">持仓盈亏率</dt><dd className="text-right">{pct(point.pnlPct)}</dd>
            <dt className="text-muted-foreground">数量</dt><dd className="text-right">{hidden ? '******' : `${p.shares.toLocaleString()} ${p.kind === 'option' ? '张' : '股'}`}</dd>
            <dt className="text-muted-foreground">成本价 / 现价</dt><dd className="text-right">{local(p.costBasis)} / {local(p.price)}</dd>
          </dl>
          <div className="mt-2"><PriceAge updatedAt={p.priceUpdatedAt} source={p.priceSource} status={p.priceStatus} error={p.quoteError} /></div>
        </div>;
      })}
    </div>}
    <style>{`
      @keyframes ibkr-scatter-pop { from { transform:scale(0); opacity:0 } to { transform:scale(1); opacity:1 } }
      @keyframes ibkr-scatter-fade { from { opacity:0 } }
      .ibkr-scatter-pending .ibkr-scatter-dot,.ibkr-scatter-pending .ibkr-scatter-line,.ibkr-scatter-pending .ibkr-scatter-label,.ibkr-scatter-pending .ibkr-scatter-logo { opacity:0 }
      .ibkr-scatter-reveal .ibkr-scatter-dot { transform-box:fill-box;transform-origin:center;animation:ibkr-scatter-pop .65s cubic-bezier(.165,.84,.44,1) both }
      .ibkr-scatter-reveal .ibkr-scatter-line { animation:ibkr-scatter-fade .65s cubic-bezier(.165,.84,.44,1) both }
      .ibkr-scatter-reveal .ibkr-scatter-label { animation:ibkr-scatter-fade .65s .8s both }
      .ibkr-scatter-reveal .ibkr-scatter-logo { animation:ibkr-scatter-fade .65s cubic-bezier(.165,.84,.44,1) both }
      @media(prefers-reduced-motion:reduce) { .ibkr-scatter-reveal .ibkr-scatter-dot,.ibkr-scatter-reveal .ibkr-scatter-line,.ibkr-scatter-reveal .ibkr-scatter-label,.ibkr-scatter-reveal .ibkr-scatter-logo { animation:none } }
    `}</style>
  </div>;
}
