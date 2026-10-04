'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { SectorRollup } from '@/lib/accumulation/derive';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';

const RAINBOW_STOPS = [
  ['0%', 'var(--accumulation-rainbow-red)'],
  ['14%', 'var(--accumulation-rainbow-orange)'],
  ['28%', 'var(--accumulation-rainbow-amber)'],
  ['43%', 'var(--accumulation-rainbow-green)'],
  ['57%', 'var(--accumulation-rainbow-cyan)'],
  ['72%', 'var(--accumulation-rainbow-blue)'],
  ['86%', 'var(--accumulation-rainbow-violet)'],
  ['93%', 'var(--accumulation-rainbow-pink)'],
  ['100%', 'var(--accumulation-rainbow-red)'],
] as const;

const HOLDING_OPACITY = 1;
// Angular gap between sectors, as a fraction of current holdings. Inserted as a
// transparent spacer slice so wedges separate WITHOUT splitting each sector's
// current-value share (which a paddingAngle would do).
const GAP_RATIO = 0.025;

// One ring. Each sector's wedge is sized only by its current real position, so
// the chart reads as the current portfolio mix without implying sector targets.
interface RingSlice {
  sector: string; // '' for spacer
  kind: 'holding' | 'gap';
  value: number;
  color: string;
}

interface LabelSlice {
  sector: string; // '' for spacer
  value: number;
}

interface Props {
  rollups: SectorRollup[];
  sectorColors: ReadonlyMap<string, string>;
  // 总体加仓进度 = AI 现值 / 目标,驱动圆环中心的接水特效。
  progress: number;
  // Effective highlight = hover ?? pin, computed by the parent.
  activeSector: string | null;
  onHover: (sector: string | null) => void;
  onTogglePin: (sector: string) => void;
}

export function SectorDonut({
  rollups,
  sectorColors,
  progress,
  activeSector,
  onHover,
  onTogglePin,
}: Props) {
  const { fmtUsd, hidden } = usePrivacyFormat();

  const { ring, labels, rollupBySector, totalCurrent, hasData } =
    useMemo(() => {
      const rollupBySector = new Map<string, SectorRollup>();
      rollups.forEach((r) => {
        rollupBySector.set(r.sector, r);
      });
      const withHoldings = rollups.filter((r) => r.currentValue > 0);
      const totalCurrent = withHoldings.reduce((s, r) => s + r.currentValue, 0);
      const gapValue = totalCurrent * GAP_RATIO;

      const ring: RingSlice[] = [];
      const labels: LabelSlice[] = [];
      withHoldings.forEach((r, idx) => {
        const color = sectorColors.get(r.sector) ?? '#64748b';
        ring.push({
          sector: r.sector,
          kind: 'holding',
          value: r.currentValue,
          color,
        });
        labels.push({ sector: r.sector, value: r.currentValue });
        // Spacer after every sector (including the last → uniform gaps).
        if (gapValue > 0 && idx < withHoldings.length) {
          ring.push({ sector: '', kind: 'gap', value: gapValue, color: '' });
          labels.push({ sector: '', value: gapValue });
        }
      });
      return {
        ring,
        labels,
        rollupBySector,
        totalCurrent,
        hasData: withHoldings.length > 0,
      };
    }, [rollups, sectorColors]);

  if (!hasData) {
    return (
      <div className="flex h-[340px] w-full max-w-xl items-center justify-center text-sm text-muted-foreground">
        暂无板块数据
      </div>
    );
  }

  const sliceOpacity = (sector: string) =>
    activeSector && activeSector !== sector
      ? HOLDING_OPACITY * 0.35
      : HOLDING_OPACITY;

  // Sector names printed just outside the ring (replaces the legend). Rendered
  // on an invisible carrier pie (one slice per sector + matching gaps) so each
  // label sits at the sector's true mid-angle. The text is interactive; the
  // carrier arcs use fill:none so they don't intercept the visible ring hover.
  const RADIAN = Math.PI / 180;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, payload, value } = props;
    const sector: string = payload?.sector ?? '';
    if (!sector) return null;
    const compact = cx < 220;
    const r = compact ? outerRadius - 18 : outerRadius + 18;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const anchor = compact ? 'middle' : x >= cx ? 'start' : 'end';
    const dim = activeSector && activeSector !== sector;
    // Share of current real holdings = this sector's wedge size in the ring.
    const pct =
      totalCurrent > 0 ? Math.round((value / totalCurrent) * 100) : 0;
    return (
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        dominantBaseline="central"
        fontSize={compact ? 12 : 19}
        fontWeight={activeSector === sector ? 800 : 700}
        fill={compact ? '#fff' : sectorColors.get(sector)}
        stroke={compact ? 'rgba(0, 0, 0, 0.24)' : 'none'}
        strokeWidth={compact ? 2 : 0}
        paintOrder="stroke"
        opacity={dim ? 0.3 : 1}
        className="cursor-pointer"
        onMouseEnter={() => onHover(sector)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onTogglePin(sector)}
      >
        {sector}
        <tspan
          dx={compact ? 4 : 7}
          fontSize={compact ? 11 : 16}
          fontWeight={600}
          opacity={compact ? 1 : 0.8}
        >
          {pct}%
        </tspan>
      </text>
    );
  };

  const hover = (d: unknown) => {
    const sector = (d as RingSlice).sector;
    onHover(sector || null);
  };
  const click = (d: unknown) => {
    const sector = (d as RingSlice).sector;
    if (sector) onTogglePin(sector);
  };

  return (
    <div className="relative w-full max-w-xl">
      {/* 圆环中央的接水特效:水位 = 总体加仓进度。绝对居中,对齐
          recharts 的 cx/cy(50%/50%),落在内圈空洞里。 */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <WaterCircle progress={progress} hidden={hidden} />
      </div>
      <ResponsiveContainer width="100%" height={440}>
        <PieChart>
          <Pie
            data={ring}
            dataKey="value"
            nameKey="sector"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="85%"
            paddingAngle={0}
            startAngle={90}
            endAngle={-270}
            // Sweep-in on mount. Route changes unmount the page, so switching
            // away to 资产看板 and back replays the expand effect. Hover only
            // changes Cell opacity (data ref is memoized), so it won't re-fire.
            isAnimationActive
            animationDuration={800}
            animationBegin={0}
            onMouseEnter={hover}
            onMouseLeave={() => onHover(null)}
            onClick={click}
            className="cursor-pointer"
          >
            {ring.map((s, i) => {
              if (s.kind === 'gap') {
                return (
                  <Cell key={`gap-${i}`} fill="none" stroke="none" />
                );
              }
              return (
                <Cell
                  key={`${s.sector}-${s.kind}-${i}`}
                  fill={s.color}
                  fillOpacity={sliceOpacity(s.sector)}
                  stroke="var(--background)"
                  strokeWidth={1.5}
                />
              );
            })}
          </Pie>
          {/* Invisible label carrier: same radius/angles/gaps as the ring so
              labels land at each sector's mid-angle. */}
          <Pie
            data={labels}
            dataKey="value"
            nameKey="sector"
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="85%"
            startAngle={90}
            endAngle={-270}
            fill="none"
            stroke="none"
            isAnimationActive={false}
            label={renderLabel}
            labelLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const sector = (payload[0].payload as RingSlice).sector;
              if (!sector) return null;
              const r = rollupBySector.get(sector);
              if (!r) return null;
              const currentShare =
                totalCurrent > 0 ? r.currentValue / totalCurrent : 0;
              const color = sectorColors.get(sector) ?? '#888888';
              return (
                <div className="min-w-[320px] rounded-lg border bg-popover px-5 py-4 text-base shadow-lg">
                  <p className="flex items-center gap-2.5 text-lg font-semibold tracking-wide">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    {sector}
                    <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                      <span
                        className="h-2 w-16 overflow-hidden rounded-full"
                        style={{ backgroundColor: `${color}33` }}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${currentShare * 100}%`,
                            backgroundColor: color,
                          }}
                        />
                      </span>
                      当前构成 {(currentShare * 100).toFixed(1)}%
                    </span>
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground tabular-nums tracking-wide">
                    当前真实仓位 {hidden ? '****' : fmtUsd(r.currentValue)}
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {r.members.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        尚未添加候选标的
                      </p>
                    )}
                    {r.members.map((m) => {
                      const holdingShare =
                        r.currentValue > 0
                          ? m.currentValue / r.currentValue
                          : 0;
                      return (
                        <div key={m.symbol} className="flex items-center gap-2.5">
                          <MemberRing
                            progress={holdingShare}
                            color={color}
                            hidden={hidden}
                          />
                          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                            {m.label}
                          </span>
                          <span className="shrink-0 text-right tabular-nums">
                            <span className="block text-sm font-medium text-foreground">
                              {hidden ? '****' : fmtUsd(m.currentValue)}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              板块内占比{' '}
                              {hidden
                                ? '****'
                                : `${(holdingShare * 100).toFixed(1)}%`}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// 圆环中心的「接水」特效:一个圆形容器,水位随加仓进度升降,水面用两层
// 反向漂移的正弦波营造晃动感(SMIL animate,自包含、无需全局 CSS)。中央叠
// 印进度百分比。边框与水体使用和图表色板一致的柔和七彩渐变。
function WaterCircle({
  progress,
  hidden,
}: {
  progress: number;
  hidden: boolean;
}) {
  const size = 200;
  const r = size / 2;
  const pct = Math.max(0, Math.min(1, progress));
  // 水面 Y:满格在顶部(0),空时在底部(size)。多留一点余量,空/满时水
  // 面不会贴边露出直角。
  const level = size * (1 - pct);
  // 满进度时仍把水面保留在圆顶下方，避免波浪完全移出视口。
  const visibleLevel = pct > 0 ? Math.max(10, level) : level;
  const clipId = 'water-clip';
  const gradId = 'rainbow-progress';
  const backGradId = 'rainbow-progress-back';
  const frontGradId = 'rainbow-progress-front';
  const backDuration = '6s';
  const frontDuration = '3.8s';

  // 一个周期 = size,路径横跨两个周期(2·size),向左平移一个周期即可
  // 无缝循环。两层波形振幅/相位/速度不同,叠出层次。
  const wave = (amp: number) =>
    `M 0 0
     Q ${size * 0.25} ${-amp}, ${size * 0.5} 0
     T ${size} 0
     T ${size * 1.5} 0
     T ${size * 2} 0
     L ${size * 2} ${size}
     L 0 ${size} Z`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="drop-shadow-sm"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx={r} cy={r} r={r - 2} />
        </clipPath>
        {/* 首尾用同一红色闭合，紫色到红色之间以粉色平滑衔接。 */}
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={size}
          y2="0"
          colorInterpolation="sRGB"
        >
          <RainbowStops />
        </linearGradient>
        {/* 波形移动时反向补偿渐变坐标，让颜色固定在圆内，仅水面移动。 */}
        <linearGradient
          id={backGradId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={size}
          y2="0"
          colorInterpolation="sRGB"
        >
          <RainbowStops />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            from="0 0"
            to={`${size} 0`}
            dur={backDuration}
            repeatCount="indefinite"
          />
        </linearGradient>
        <linearGradient
          id={frontGradId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2={size}
          y2="0"
          colorInterpolation="sRGB"
        >
          <RainbowStops />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            from={`${size} 0`}
            to="0 0"
            dur={frontDuration}
            repeatCount="indefinite"
          />
        </linearGradient>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* 极淡底色让空水位保持可读，但不干扰水面边界。 */}
        <rect
          width={size}
          height={size}
          fill={`url(#${gradId})`}
          fillOpacity="var(--accumulation-water-base-opacity)"
        />
        {/* 直接绘制两层水体，避免部分浏览器不刷新动画 clipPath。 */}
        <g transform={`translate(0 ${visibleLevel})`}>
          <path
            d={wave(9)}
            fill={`url(#${backGradId})`}
            fillOpacity="var(--accumulation-water-back-opacity)"
            stroke={`url(#${backGradId})`}
            strokeOpacity="var(--accumulation-water-back-stroke-opacity)"
            strokeWidth={1.5}
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              from="0 0"
              to={`${-size} 0`}
              dur={backDuration}
              repeatCount="indefinite"
            />
          </path>
          <path
            d={wave(6)}
            fill={`url(#${frontGradId})`}
            fillOpacity="var(--accumulation-water-front-opacity)"
            stroke={`url(#${frontGradId})`}
            strokeOpacity="var(--accumulation-water-front-stroke-opacity)"
            strokeWidth={2}
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              from={`${-size} 0`}
              to="0 0"
              dur={frontDuration}
              repeatCount="indefinite"
            />
          </path>
        </g>
      </g>

      {/* 柔和的七彩描边，压在水面之上。 */}
      <circle
        cx={r}
        cy={r}
        r={r - 2}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeOpacity="var(--accumulation-water-outline-opacity)"
        strokeWidth={2}
      />

      {/* 中央进度数字 */}
      <text
        x={r}
        y={r - 6}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={34}
        fontWeight={800}
        className="fill-foreground"
      >
        {hidden ? '****' : `${(pct * 100).toFixed(0)}%`}
      </text>
      <text
        x={r}
        y={r + 22}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={600}
        className="fill-muted-foreground"
      >
        仓位进度
      </text>
    </svg>
  );
}

function RainbowStops() {
  return RAINBOW_STOPS.map(([offset, stopColor]) => (
    <stop key={offset} offset={offset} stopColor={stopColor} />
  ));
}

// Per-stock share donut for the tooltip: the arc is this stock's current-value
// share inside the sector. It deliberately carries no target amount.
function MemberRing({
  progress,
  color,
  hidden,
}: {
  progress: number;
  color: string;
  hidden: boolean;
}) {
  const size = 34;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(1, progress));
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeOpacity={0.2}
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled * circ} ${circ}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text
        x={center}
        y={center}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fontWeight={700}
        fill={color}
      >
        {hidden ? '•' : Math.round(filled * 100)}
      </text>
    </svg>
  );
}
