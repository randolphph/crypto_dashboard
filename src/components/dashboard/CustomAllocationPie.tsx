'use client';

import { useEffect, useRef } from 'react';
import { init, use as registerECharts, type EChartsCoreOption } from 'echarts/core';
import { CustomChart, type CustomSeriesOption } from 'echarts/charts';
import { SVGRenderer } from 'echarts/renderers';
import { buildCustomPieSlices, type CustomPieValue } from '@/lib/portfolio/customPie';

registerECharts([CustomChart, SVGRenderer]);
type CustomElement = NonNullable<ReturnType<NonNullable<CustomSeriesOption['renderItem']>>>;
interface Props {
  items: CustomPieValue[];
  activeLabel: string | null;
  replayKey: number;
  onHover: (label: string | null) => void;
  onReplay: () => void;
}

// G13 · Big Slice (Custom Pie), from Lieflat Charts' Glance gallery.
// Preserves the custom sector/group structure, guide rings, r0 entrance,
// cubicOut easing, 900 ms duration and staggered 130 ms reveal.
export function CustomAllocationPie(props: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  const paintRef = useRef<((fresh?: boolean) => void) | null>(null);
  useEffect(() => { propsRef.current = props; paintRef.current?.(); }, [props]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const chart = init(root, null, { renderer: 'svg' });
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const paint = (fresh = false) => {
      if (!visible) return;
      if (fresh) chart.clear();
      const current = propsRef.current;
      const slices = buildCustomPieSlices(current.items);
      const styles = getComputedStyle(root);
      const paper = styles.getPropertyValue('--card').trim();
      const grid = styles.getPropertyValue('--border').trim();
      if (fresh) root.dataset.animationState = motion.matches ? 'ready' : 'entering';
      root.dataset.animated = motion.matches ? 'false' : 'true';
      const series: CustomSeriesOption = {
        id: 'allocation', type: 'custom', coordinateSystem: 'none',
        renderItem: (params, api) => {
          const slice = slices[params.dataIndex];
          const cx = api.getWidth() / 2, cy = api.getHeight() / 2 + 3;
          const radius = Math.min(api.getWidth(), api.getHeight()) * .42;
          const innerRadius = radius * .24;
          const radiusOf = (ratio: number) => innerRadius + (radius - innerRadius) * ratio;
          const children: CustomElement[] = [];
          if (params.dataIndex === 0) {
            [.25, .5, 1].forEach((fraction, index) => children.push({ type: 'circle', name: `guide-${index}`, silent: true,
              shape: { cx, cy, r: radiusOf(Math.sqrt(fraction)) }, style: { fill: 'none', stroke: grid, lineWidth: 1, lineDash: [3, 4] } }));
          }
          children.push({ type: 'sector', name: 'allocation-sector',
            shape: { cx, cy, r0: innerRadius, r: radiusOf(slice.radiusRatio), startAngle: slice.startAngle, endAngle: slice.endAngle, clockwise: true, cornerRadius: 5 },
            style: { fill: slice.color?.startsWith('var(') ? styles.getPropertyValue(slice.color.slice(4, -1)).trim() : slice.color ?? styles.getPropertyValue('--chart-1').trim(), stroke: paper, lineWidth: 3, opacity: current.activeLabel && current.activeLabel !== slice.label ? .35 : 1 },
            enterFrom: { shape: { r: innerRadius } },
          });
          return { type: 'group', children };
        },
        data: slices.map(slice => ({ id: slice.label, name: slice.label, value: slice.share })),
      };
      const option: EChartsCoreOption = {
        animation: !motion.matches, animationDuration: 900, animationEasing: 'cubicOut', animationDelay: (index: number) => index * 130,
        animationDurationUpdate: 250, animationEasingUpdate: 'cubicOut', series: [series],
      };
      chart.setOption(option);
    };
    paintRef.current = paint;
    const select = (event: { dataIndex?: number }) => buildCustomPieSlices(propsRef.current.items)[event.dataIndex ?? -1]?.label;
    chart.on('mouseover', event => { const label = select(event); if (label) propsRef.current.onHover(label); });
    chart.on('mouseout', () => propsRef.current.onHover(null));
    chart.on('globalout', () => propsRef.current.onHover(null));
    chart.on('finished', () => { root.dataset.animationState = 'ready'; });
    const observer = new IntersectionObserver(entries => {
      if (!visible && entries.some(entry => entry.isIntersecting)) { visible = true; paint(true); observer.disconnect(); }
    }, { threshold: .25 });
    observer.observe(root);
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(root);
    const theme = new MutationObserver(() => paint());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-color-scheme'] });
    const motionChanged = () => paint();
    motion.addEventListener('change', motionChanged);
    return () => {
      paintRef.current = null;
      observer.disconnect(); resize.disconnect(); theme.disconnect();
      motion.removeEventListener('change', motionChanged);
      chart.dispose();
    };
  }, [props.replayKey]);

  return <div ref={rootRef} data-allocation-custom-pie data-replay-key={props.replayKey} data-animation-state="pending"
    role="button" tabIndex={0} aria-label="资产分类占比饼图，点击重播动画" onClick={props.onReplay}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onReplay(); } }}
    className="aspect-square w-full cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />;
}
