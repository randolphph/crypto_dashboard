'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { init, use as registerECharts } from 'echarts/core';
import { TreemapChart, type TreemapSeriesOption } from 'echarts/charts';
import { TooltipComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { LabelLayout } from 'echarts/features';
import { formatCrypto, formatUsd } from '@/lib/format';
import { CHART_SERIES } from '@/lib/theme/colors';
import type { buildExchangeTreemap, ExchangeTreeNode } from '@/lib/portfolio/exchangeTreemap';
import { assetIconSource } from '@/lib/portfolio/assetIconSource';
import type { AssetBalance } from '@/types/common';

registerECharts([TreemapChart, TooltipComponent, AriaComponent, SVGRenderer, LabelLayout]);
type Model = ReturnType<typeof buildExchangeTreemap>;
type ChartNode = NonNullable<TreemapSeriesOption['data']>[number];
interface Props { exchange: string; model: Model; hidden: boolean; percentHidden: boolean; replayKey: number; onReplay: () => void }
interface TileOverlay {
  node: ExchangeTreeNode;
  x: number; y: number; width: number; height: number;
  src: string | null;
  maxIconSize: number | null;
  color: string;
  fill: string;
  dataIndex: number;
}
const ICON_RATIO = .32;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

// F13 · Nested Treemap, basics-gallery.html · "Where the work went".
// Retain two levels, parent bands, direct area encoding, squareRatio 1.2,
// SVG layout; HTML tiles assemble in a staggered reveal. No drill-down or zoom.
export function ExchangeTreemap(props: Props) {
  const { exchange, model, hidden, percentHidden, replayKey, onReplay } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [tiles, setTiles] = useState<TileOverlay[]>([]);
  const currentRef = useRef({ exchange, model, hidden, percentHidden });
  const paintRef = useRef<(() => void) | null>(null);
  const settleRef = useRef<(() => void) | null>(null);
  const showTipRef = useRef<((dataIndex: number) => void) | null>(null);
  useEffect(() => { currentRef.current = { exchange, model, hidden, percentHidden }; paintRef.current?.(); }, [exchange, model, hidden, percentHidden]);
  useLayoutEffect(() => { if (tiles.length) settleRef.current?.(); }, [tiles, replayKey]);

  useEffect(() => {
    const root = rootRef.current;
    const host = chartRef.current;
    if (!root || !host) return;
    const chart = init(host, null, { renderer: 'svg' });
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let disposed = false;
    let assemblyPass = 0;
    let iconFrame: number | null = null;
    const images = new Map<string, { image: HTMLImageElement; status: 'loading' | 'ready' | 'error' }>();
    let layouts = new Map<string, TileOverlay>();
    let overlaySignature = '';
    const settle = () => {
      const pass = ++assemblyPass;
      const animations = [...root.querySelectorAll('[data-treemap-tile]')].flatMap(tile => tile.getAnimations()).filter(animation => animation.playState !== 'finished');
      root.dataset.animationState = animations.length ? 'entering' : 'ready';
      if (animations.length) void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (!disposed && pass === assemblyPass) root.dataset.animationState = 'ready';
      });
    };
    settleRef.current = settle;
    showTipRef.current = dataIndex => chart.dispatchAction(dataIndex < 0 ? { type: 'hideTip' } : { type: 'showTip', seriesIndex: 0, dataIndex });
    const queueIcons = () => {
      if (disposed || iconFrame !== null) return;
      iconFrame = requestAnimationFrame(() => { iconFrame = null; paint(false, true); });
    };
    const pixelRatio = () => Math.max(1, window.devicePixelRatio || 1);
    const isVector = (image: HTMLImageElement) => /\.svg(?:[?#]|$)/i.test(image.src);
    const loadIcon = (balance: AssetBalance, size = 16) => {
      const { src, fallbackSrc } = assetIconSource(balance, 'large');
      let best: HTMLImageElement | null = null;
      for (const url of [src, fallbackSrc]) {
        if (!url) continue;
        let entry = images.get(url);
        if (!entry) {
          const image = new Image();
          entry = { image, status: 'loading' }; images.set(url, entry);
          image.onload = () => { if (!disposed) { entry!.status = 'ready'; queueIcons(); } };
          image.onerror = () => { if (!disposed) { entry!.status = 'error'; queueIcons(); } };
          image.src = url;
        }
        if (entry.status === 'ready') {
          const image = entry.image;
          if (!best || Math.min(image.naturalWidth, image.naturalHeight) > Math.min(best.naturalWidth, best.naturalHeight)) best = image;
          // Prefer the source's identity when its resolution is sufficient;
          // otherwise try the cached high-resolution lookup before scaling it.
          if (isVector(image) || Math.min(image.naturalWidth, image.naturalHeight) >= size * pixelRatio()) return image;
        }
        if (entry.status === 'loading') return best;
      }
      return best;
    };
    const paint = (fresh = false, iconsOnly = false) => {
      if (!visible) return;
      if (fresh) chart.clear();
      const { exchange, model, hidden, percentHidden } = currentRef.current;
      const css = getComputedStyle(root);
      const paper = css.getPropertyValue('--card').trim();
      const ink = css.getPropertyValue('--foreground').trim();
      const money = (value: number) => hidden ? '******' : formatUsd(value);
      const share = (value: number) => percentHidden ? '**%' : `${(value / model.total * 100).toFixed(1)}%`;
      // White lettering needs deeper fills in light mode; dark mode uses
      // pastel fills and black lettering. Derive both from the selected palette.
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      const rgb = (color: string) => {
        context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const luminance = (values: number[]) => {
        const [r, g, b] = values.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
        return .2126 * r + .7152 * g + .0722 * b;
      };
      const dark = document.documentElement.classList.contains('dark');
      const text = dark ? '#000000' : '#ffffff';
      const tileColor = (base: string) => {
        const original = rgb(base);
        let color = dark ? original.map(n => Math.round(n + (255 - n) * .64)) : original;
        while (!dark && 1.05 / (luminance(color) + .05) < 4.5) color = color.map(n => Math.floor(n * .92));
        return `rgb(${color.join(', ')})`;
      };
      const leaves = new Map<number, Pick<TileOverlay, 'node' | 'src' | 'color' | 'maxIconSize' | 'fill' | 'dataIndex'>>();
      layouts = new Map();
      const data = model.groups.map((group, index) => {
        const fill = tileColor(css.getPropertyValue(CHART_SERIES[index % CHART_SERIES.length].slice(4, -1)).trim());
        return { ...group, itemStyle: { color: 'transparent' }, children: group.children?.map((child): ChartNode => {
          const balance = child.other ? undefined : child.balances.find(balance => balance.logo) ?? child.balances[0];
          const image = balance ? loadIcon(balance, Math.min(host.clientWidth, host.clientHeight) * ICON_RATIO) : null;
          const maxIconSize = image && !isVector(image) ? Math.min(image.naturalWidth, image.naturalHeight) / pixelRatio() : null;
          return { ...child, itemStyle: { color: 'transparent' }, label: { color: text,
            // Native labels supply ECharts' public layout rectangles. The
            // visible labels and centered icons share one clipped overlay.
            fontSize: 0, padding: 0,
            formatter: params => { leaves.set(params.dataIndex, { node: child, src: image?.src ?? null, color: text, maxIconSize, fill, dataIndex: params.dataIndex }); return child.name; },
          } };
        }) };
      });
      const tooltip = (params: unknown) => {
        const node = (params as { data?: ExchangeTreeNode }).data;
        if (!node?.account || !Array.isArray(node.balances)) return '';
        const path = node.children ? `${exchange} / ${node.account}` : `${exchange} / ${node.account} / ${node.name}`;
        const rows = node.balances.slice(0, 8).map(balance => {
          const amount = hidden ? '****' : Number.isFinite(balance.amount) ? formatCrypto(balance.amount) : '—';
          const image = loadIcon(balance);
          const icon = image ? `<img src="${escape(image.src)}" alt="" width="16" height="16" style="width:16px;height:16px;border-radius:50%;flex-shrink:0">`
            : `<span style="display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;border-radius:50%;font-size:10px;border:1px solid currentColor">${escape((balance.asset.replace(/[^A-Za-z0-9]/g, '')[0] ?? '?').toUpperCase())}</span>`;
          return `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:6px"><span style="display:inline-flex;align-items:center;gap:6px">${icon}${escape(balance.asset)} · ${amount}</span><span>${money(balance.usdValue)}</span></div>`;
        }).join('');
        return `<div data-exchange-tree-tooltip="${escape(exchange)}"><div style="font-weight:600;overflow-wrap:anywhere">${escape(path)}</div><div style="margin-top:6px;font-weight:600">${money(node.value)} <span style="font-weight:400">· 占图中资产 ${share(node.value)}</span></div>${rows}${node.balances.length > 8 ? '<div style="margin-top:8px">其余标的可在明细中查看</div>' : ''}</div>`;
      };
      const series: TreemapSeriesOption = {
        type: 'treemap', id: 'exchange-holdings', data, top: 0, right: 0, bottom: 0, left: 0,
        roam: false, nodeClick: false, breadcrumb: { show: false }, leafDepth: 2, squareRatio: 1.2,
        sort: 'desc', visibleMin: 0, childrenVisibleMin: 0,
        labelLayout: params => {
          const leaf = params.dataIndex === undefined ? undefined : leaves.get(params.dataIndex);
          if (leaf) layouts.set(leaf.node.id, { ...leaf, ...params.rect });
          return {};
        },
        label: { show: true, position: 'insideTopLeft', padding: [10, 8], fontSize: 13, fontWeight: 600,
          lineHeight: 21, overflow: 'truncate', formatter: params => {
            const node = params.data as ExchangeTreeNode;
            return node.account ? `${node.name}\n${money(node.value)} · ${share(node.value)}` : '';
          } },
        upperLabel: { show: true, height: 32, padding: [0, 10], color: ink, fontSize: 12,
          fontWeight: 600, backgroundColor: paper,
          formatter: params => { const node = params.data as ExchangeTreeNode; return node.account ? `${node.name}  ${money(node.value)}` : ''; } },
        itemStyle: { borderColor: paper, borderWidth: 2, gapWidth: 2 },
        emphasis: { focus: 'ancestor', itemStyle: { borderColor: ink, borderWidth: 1.5 } },
        levels: [{ label: { show: false }, upperLabel: { show: false }, itemStyle: { borderWidth: 0, gapWidth: 5 } },
          { upperLabel: { show: true, height: 32 }, itemStyle: { borderColor: paper, borderWidth: 3, gapWidth: 3 } },
          { upperLabel: { show: false }, itemStyle: { borderColor: paper, borderWidth: 2, gapWidth: 2 } }],
      };
      if (!iconsOnly) chart.dispatchAction({ type: 'hideTip' });
      if (!iconsOnly) root.dataset.animationState = 'entering';
      root.dataset.animated = String(!motion.matches);
      chart.setOption({ animation: false, aria: { enabled: true, label: { description: hidden
          ? `${exchange} 持仓矩形树图，金额和数量已隐藏` : `${exchange} 持仓矩形树图，${model.assetCount} 项资产，按账户分组，面积表示 USD 金额` } },
        tooltip: { triggerOn: 'mousemove', confine: true, appendTo: 'body',
          backgroundColor: css.getPropertyValue('--popover').trim(), borderColor: css.getPropertyValue('--border').trim(),
          textStyle: { color: css.getPropertyValue('--popover-foreground').trim(), fontSize: 12 },
          extraCssText: 'z-index:70;max-width:min(320px,calc(100vw - 80px));white-space:normal;border-radius:8px;',
          formatter: tooltip }, series: [series] });
    };
    paintRef.current = paint;
    chart.on('finished', () => {
      const next = [...layouts.values()];
      // clear() can emit finished before its replacement layout exists.
      if (!next.length) return;
      const signature = JSON.stringify(next);
      if (signature !== overlaySignature) { overlaySignature = signature; setTiles(next); }
      else settle();
    });
    const observer = new IntersectionObserver(entries => {
      if (!visible && entries.some(entry => entry.isIntersecting)) { visible = true; paint(true); observer.disconnect(); }
    }, { threshold: .15 });
    observer.observe(root);
    const resize = new ResizeObserver(() => {
      chart.dispatchAction({ type: 'hideTip' });
      root.dataset.animationState = 'entering'; chart.resize();
    }); resize.observe(root);
    const theme = new MutationObserver(() => paint());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-color-scheme'] });
    const motionChanged = () => paint(true); motion.addEventListener('change', motionChanged);
    return () => {
      disposed = true;
      assemblyPass++;
      if (iconFrame !== null) cancelAnimationFrame(iconFrame);
      for (const { image } of images.values()) { image.onload = null; image.onerror = null; }
      paintRef.current = null; settleRef.current = null; showTipRef.current = null; observer.disconnect(); resize.disconnect(); theme.disconnect();
      motion.removeEventListener('change', motionChanged); chart.dispose();
    };
  }, []);

  const replay = () => { showTipRef.current?.(-1); onReplay(); };
  return <div ref={rootRef} data-exchange-treemap={exchange} data-replay-key={replayKey} data-animation-state="pending"
    role="group" aria-label={hidden ? `${exchange} 持仓矩形树图，金额和数量已隐藏` : `${exchange} 持仓矩形树图`}
    tabIndex={0} onClick={replay}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); replay(); } }}
    className="relative h-[340px] w-full cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[360px]">
    <div ref={chartRef} className="h-full w-full" />
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {tiles.map((tile, index) => {
        const size = Math.min(tile.width, tile.height) * ICON_RATIO;
        const letter = tile.node.other ? '⋯' : (tile.node.name.replace(/[^A-Za-z0-9]/g, '')[0] ?? '?').toUpperCase();
        return <div key={`${replayKey}:${tile.node.id}`} data-treemap-tile={tile.node.id}
          className="exchange-treemap-piece absolute overflow-hidden"
          style={{ left: tile.x, top: tile.y, width: tile.width, height: tile.height, color: tile.color, backgroundColor: tile.fill,
            animationDelay: `${Math.min(index, 18) * 35}ms`, '--piece-x': `${index % 2 ? 18 : -18}px`, '--piece-y': `${index % 3 ? 22 : -22}px` } as CSSProperties}>
          <button type="button" data-treemap-icon data-treemap-replay aria-label={`重播 ${exchange} ${tile.node.account} ${tile.node.name} 持仓图动画`}
            onPointerEnter={event => { if (event.pointerType === 'mouse') showTipRef.current?.(tile.dataIndex); }}
            onFocus={() => showTipRef.current?.(tile.dataIndex)} onBlur={() => showTipRef.current?.(-1)}
            className="pointer-events-auto absolute flex cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
            style={{ left: '50%', top: '50%', width: size, height: size, transform: 'translate(-50%, -50%)', fontSize: size * .48, fontWeight: 600 }}>
            {tile.src ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={tile.src} alt="" width={size} height={size} className="block object-contain"
                style={{ width: Math.min(size, tile.maxIconSize ?? size), height: Math.min(size, tile.maxIconSize ?? size) }} /> : letter}
          </button>
          {tile.height >= 80 && tile.width >= 60 && <span data-treemap-label className="absolute left-2 top-2 max-w-[calc(100%-16px)] truncate text-xs font-semibold">{tile.node.name}</span>}
          {tile.height >= 160 && tile.width >= 120 && <span className="absolute left-2 top-7 max-w-[calc(100%-16px)] truncate text-xs font-medium">
            {hidden ? '******' : formatUsd(tile.node.value)} · {percentHidden ? '**%' : `${(tile.node.value / model.total * 100).toFixed(1)}%`}
          </span>}
        </div>;
      })}
    </div>
    <style>{`
      @keyframes exchange-treemap-assemble {
        from { opacity:0; transform:translate(var(--piece-x),var(--piece-y)) scale(.78) }
        to { opacity:1; transform:translate(0,0) scale(1) }
      }
      .exchange-treemap-piece { animation:exchange-treemap-assemble 520ms cubic-bezier(.16,1,.3,1) both; transform-origin:center }
      @media(prefers-reduced-motion:reduce) { .exchange-treemap-piece { animation:none } }
    `}</style>
  </div>;
}
