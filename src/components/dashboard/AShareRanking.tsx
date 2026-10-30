'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/format';
import type { buildAShareRanking } from '@/lib/portfolio/aShareRanking';
import { PriceAge } from '@/components/common/PriceAge';
import { TokenIcon } from './TokenIcon';
import { stockIconUrl } from '@/lib/portfolio/stockIcons';

type Model = ReturnType<typeof buildAShareRanking>;
const rnd = (i: number, k: number) => Math.abs(((i * 73856093) ^ (k * 19349663)) % 1000) / 1000;

// F5 · Tick Rows, C1 in basics-gallery.html · "Six teams, shipped and counted".
// Keep one queue per holding, a shared unit, a hairline guide, every-fifth
// markers and staggered ticks. A fractional last tick preserves exact values.
export function AShareRanking({ model, hidden, percentHidden, replayKey, onReplay }: { model: Model; hidden: boolean; percentHidden: boolean; replayKey: number; onReplay: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dismissedHover = useRef<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [tipTop, setTipTop] = useState(40);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setRevealed(true); observer.disconnect(); }
    }, { threshold: .15 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const active = model.rows.find(row => row.position.id === (hovered ?? focused));
  const locate = (event: { currentTarget: HTMLButtonElement }) => {
    const root = rootRef.current;
    if (!root) return;
    const box = event.currentTarget.getBoundingClientRect();
    setTipTop(Math.max(8, Math.min(box.bottom + 8, window.innerHeight - 288)) - root.getBoundingClientRect().top);
  };
  const close = () => { dismissedHover.current = active?.position.id ?? null; setHovered(null); setFocused(null); };
  const replay = () => { close(); onReplay(); };
  const money = (value: number | undefined) => hidden ? '******' : value !== undefined && Number.isFinite(value) ? formatCurrency(value, 'CNY') : '—';
  const share = (value: number) => percentHidden ? '**%' : value > 0 && value < .01 ? '<0.01%' : `${value.toFixed(value > 0 && value < .1 ? 2 : 1)}%`;
  const p = active?.position;
  return <div ref={rootRef} data-a-share-ranking data-replay-key={replayKey} role="group" aria-label="A股持仓排名图，点击重播动画" tabIndex={0}
    className="relative w-full min-w-0 max-w-[900px] cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={replay} onPointerLeave={() => { dismissedHover.current = null; setHovered(null); }}
    onKeyDown={event => {
      if (event.key === 'Escape') close();
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); replay(); }
    }}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>按持仓市值排名 · CNY · {model.rows.length} 只</span><span data-ranking-unit>{hidden ? '金额已隐藏' : `每格 ${money(model.unit)}`}</span>
    </div>
    <div className="max-h-[480px] overflow-y-auto overscroll-contain pr-1">
      <ol key={replayKey} aria-label="A股持仓市值排名" className={revealed ? 'a-share-ranking-reveal' : 'a-share-ranking-pending'}>
        {model.rows.map((row, rank) => {
          const position = row.position, name = position.name || position.quoteName || position.symbol;
          const selected = active?.position.id === position.id, delay = Math.min(rank, 7) * .08;
          return <li key={position.id} data-a-share-rank={position.id}>
            <button type="button" aria-label={`${name} ${position.symbol}，悬停查看持仓详情，点击重播动画`}
              onPointerEnter={event => { if (event.pointerType === 'mouse' && dismissedHover.current !== position.id) { dismissedHover.current = null; setHovered(position.id); locate(event); } }}
              onPointerLeave={() => { if (dismissedHover.current === position.id) dismissedHover.current = null; setHovered(null); }}
              onFocus={event => { dismissedHover.current = null; setFocused(position.id); locate(event); }} onBlur={() => setFocused(null)}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0 rounded-lg px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[148px_minmax(0,1fr)_108px] ${selected ? 'bg-muted/50' : 'hover:bg-muted/30'}`}>
              <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{String(rank + 1).padStart(2, '0')}</span>
                <TokenIcon src={stockIconUrl('A', position.symbol)} symbol={name} size={20} />
                <span className="min-w-0"><span data-ranking-name className="block truncate text-sm font-medium leading-4">{name}</span><span className="block text-[11px] leading-3 text-muted-foreground">{position.symbol}</span></span>
              </span>
              <svg data-ranking-ticks aria-hidden="true" viewBox="0 0 400 32" preserveAspectRatio="none"
                className="col-span-2 col-start-1 row-start-2 block h-6 w-full sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <line x1={0} x2={400} y1={22} y2={22} stroke="var(--border)" strokeWidth={.6} vectorEffect="non-scaling-stroke" />
                {row.ticks.map((fraction, index) => {
                  const x = (index + fraction / 2) / model.slots * 400, height = (9 + rnd(index + 1, rank + 2) * 6) * fraction;
                  const style = { animationDelay: `${delay + index * .012}s` };
                  return <g key={index} className="a-share-ranking-tick" style={style}>
                    <line data-ranking-tick x1={x} x2={x} y1={22} y2={22 - height} stroke={rank === 0 ? 'var(--primary)' : 'var(--foreground)'}
                      strokeWidth={.9} opacity={.55 + rnd(index + 3, rank + 5) * .45} vectorEffect="non-scaling-stroke" />
                    {index % 5 === 4 && fraction === 1 && <circle cx={x} cy={27} r={.8} fill="var(--muted-foreground)" />}
                  </g>;
                })}
              </svg>
              <span className="col-start-2 row-start-1 text-right tabular-nums sm:col-start-3">
                <span data-ranking-value className="block text-sm font-semibold leading-4">{money(position.marketValue)}</span>
                <span data-ranking-share className="block text-xs leading-4 text-muted-foreground">{share(row.share)}</span>
              </span>
            </button>
          </li>;
        })}
      </ol>
    </div>
    {active && p && <div role="region" aria-label="A股持仓详情" data-a-share-ranking-tooltip
      className="pointer-events-none absolute right-2 z-30 max-h-[280px] w-[310px] max-w-[calc(100%-16px)] overflow-y-auto rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
      style={{ top: tipTop }}>
      <div className="mb-1 flex items-center gap-1.5 pr-5 font-semibold"><TokenIcon src={stockIconUrl('A', p.symbol)} symbol={p.symbol} size={16} />{p.name || p.quoteName || p.symbol}</div>
      <p className="mb-2 text-muted-foreground">{p.symbol} · A股</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 tabular-nums">
        <dt className="text-muted-foreground">持仓市值</dt><dd className="text-right font-medium">{money(p.marketValue)}</dd>
        <dt className="text-muted-foreground">持仓占比</dt><dd className="text-right">{share(active.share)}</dd>
        <dt className="text-muted-foreground">数量</dt><dd className="text-right">{hidden ? '******' : `${p.shares.toLocaleString()} 股`}</dd>
        <dt className="text-muted-foreground">成本价 / 现价</dt><dd className="text-right">{money(p.costBasis)} / {money(p.price)}</dd>
        <dt className="text-muted-foreground">持仓盈亏</dt><dd className="text-right">{money(p.pnl)}</dd>
        <dt className="text-muted-foreground">持仓盈亏率</dt><dd className="text-right">{p.pnlPct === undefined || !Number.isFinite(p.pnlPct) ? '—' : percentHidden ? '**%' : `${p.pnlPct.toFixed(2)}%`}</dd>
      </dl>
      <div className="mt-2"><PriceAge updatedAt={p.priceUpdatedAt} source={p.priceSource} status={p.priceStatus} error={p.quoteError} /></div>
    </div>}
    <style>{`
      @keyframes a-share-ranking-fade { from { opacity:0 } }
      .a-share-ranking-pending .a-share-ranking-tick { opacity:0 }
      .a-share-ranking-reveal .a-share-ranking-tick { animation:a-share-ranking-fade .9s ease both }
      @media(prefers-reduced-motion:reduce) { .a-share-ranking-reveal .a-share-ranking-tick { animation:none } }
    `}</style>
  </div>;
}
