'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { SectorRollup } from '@/lib/accumulation/derive';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';

// Shared palette with the dashboard's category pie so a sector reads as the
// same hue across the app.
const COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#f97316',
];

const FILLED_OPACITY = 1;
const REMAINING_OPACITY = 0.3;
// Angular gap between sectors, as a fraction of total target. Inserted as a
// transparent spacer slice so wedges separate WITHOUT splitting each sector's
// filled/remaining halves (which a paddingAngle would do).
const GAP_RATIO = 0.025;

// One ring. Each sector's wedge is sized by its TARGET weight; within the wedge
// the achieved part (current) is drawn in saturated color and the gap (target −
// current) in a faded tint of the same hue — so the color alone reads as that
// sector's加仓进度.
interface RingSlice {
  sector: string; // '' for spacer
  kind: 'filled' | 'remaining' | 'gap';
  value: number;
  color: string;
}

interface LabelSlice {
  sector: string; // '' for spacer
  value: number;
}

interface Props {
  rollups: SectorRollup[];
  // Effective highlight = hover ?? pin, computed by the parent.
  activeSector: string | null;
  onHover: (sector: string | null) => void;
  onTogglePin: (sector: string) => void;
}

export function SectorDonut({
  rollups,
  activeSector,
  onHover,
  onTogglePin,
}: Props) {
  const { fmtUsd, hidden } = usePrivacyFormat();

  const { ring, labels, colorBySector, rollupBySector, totalTarget, hasData } =
    useMemo(() => {
      const colorBySector = new Map<string, string>();
      const rollupBySector = new Map<string, SectorRollup>();
      rollups.forEach((r, i) => {
        colorBySector.set(r.sector, COLORS[i % COLORS.length]);
        rollupBySector.set(r.sector, r);
      });
      const withTarget = rollups.filter((r) => r.targetValue > 0);
      const totalTarget = withTarget.reduce((s, r) => s + r.targetValue, 0);
      const gapValue = totalTarget * GAP_RATIO;

      const ring: RingSlice[] = [];
      const labels: LabelSlice[] = [];
      withTarget.forEach((r, idx) => {
        const color = colorBySector.get(r.sector)!;
        const filled = Math.min(Math.max(r.currentValue, 0), r.targetValue);
        const remaining = Math.max(r.targetValue - filled, 0);
        // Keep filled then remaining adjacent so they read as one wedge.
        if (filled > 0)
          ring.push({ sector: r.sector, kind: 'filled', value: filled, color });
        if (remaining > 0)
          ring.push({
            sector: r.sector,
            kind: 'remaining',
            value: remaining,
            color,
          });
        labels.push({ sector: r.sector, value: r.targetValue });
        // Spacer after every sector (including the last → uniform gaps).
        if (gapValue > 0 && idx < withTarget.length) {
          ring.push({ sector: '', kind: 'gap', value: gapValue, color: '' });
          labels.push({ sector: '', value: gapValue });
        }
      });
      return {
        ring,
        labels,
        colorBySector,
        rollupBySector,
        totalTarget,
        hasData: withTarget.length > 0,
      };
    }, [rollups]);

  if (!hasData) {
    return (
      <div className="flex h-[340px] w-full max-w-xl items-center justify-center text-sm text-muted-foreground">
        暂无板块数据
      </div>
    );
  }

  const sliceOpacity = (sector: string, kind: 'filled' | 'remaining') => {
    const base = kind === 'filled' ? FILLED_OPACITY : REMAINING_OPACITY;
    return activeSector && activeSector !== sector ? base * 0.35 : base;
  };

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
    const r = outerRadius + 18;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const anchor = x >= cx ? 'start' : 'end';
    const dim = activeSector && activeSector !== sector;
    // Share of total target = this sector's wedge size in the ring.
    const pct =
      totalTarget > 0 ? Math.round((value / totalTarget) * 100) : 0;
    return (
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        dominantBaseline="central"
        fontSize={19}
        fontWeight={activeSector === sector ? 800 : 700}
        fill={colorBySector.get(sector)}
        opacity={dim ? 0.3 : 1}
        className="cursor-pointer"
        onMouseEnter={() => onHover(sector)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onTogglePin(sector)}
      >
        {sector}
        <tspan dx={7} fontSize={16} fontWeight={600} opacity={0.8}>
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
    <div className="w-full max-w-xl">
      <ResponsiveContainer width="100%" height={440}>
        <PieChart>
          <Pie
            data={ring}
            dataKey="value"
            nameKey="sector"
            cx="50%"
            cy="50%"
            innerRadius={124}
            outerRadius={188}
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
                  fillOpacity={sliceOpacity(s.sector, s.kind)}
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
            innerRadius={124}
            outerRadius={188}
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
              const progress =
                r.targetValue > 0
                  ? Math.min(1, r.currentValue / r.targetValue) * 100
                  : 0;
              const color = colorBySector.get(sector) ?? '#888888';
              return (
                <div className="min-w-[320px] rounded-lg border bg-popover px-5 py-4 text-base shadow-lg">
                  <p className="flex items-center gap-2.5 text-lg font-semibold tracking-wide">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-sm"
                      style={{ backgroundColor: colorBySector.get(sector) }}
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
                            width: `${progress}%`,
                            backgroundColor: color,
                          }}
                        />
                      </span>
                      进度 {progress.toFixed(0)}%
                    </span>
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground tabular-nums tracking-wide">
                    现有 {hidden ? '****' : fmtUsd(r.currentValue)} · 目标{' '}
                    {hidden ? '****' : fmtUsd(r.targetValue)}
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {r.members.map((m) => {
                      // Mini-ring depth = this stock's progress toward its own
                      // target; the % beside the name = its share of the
                      // sector's target.
                      const prog =
                        m.targetValue > 0
                          ? Math.min(1, m.currentValue / m.targetValue)
                          : 0;
                      const tgtShare =
                        r.targetValue > 0
                          ? (m.targetValue / r.targetValue) * 100
                          : 0;
                      return (
                        <div key={m.symbol} className="flex items-center gap-2.5">
                          <MemberRing progress={prog} color={color} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="truncate font-medium text-foreground">
                                {m.label}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                目标占比 {tgtShare.toFixed(0)}%
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              现有 {hidden ? '****' : fmtUsd(m.currentValue)} ·
                              目标 {hidden ? '****' : fmtUsd(m.targetValue)}
                            </div>
                          </div>
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

// Per-stock progress donut for the tooltip: a light track (sector color, faded)
// with a saturated arc whose length = currentValue / targetValue, plus the
// progress % in the middle. Same 深浅 language as the main ring.
function MemberRing({
  progress,
  color,
}: {
  progress: number;
  color: string;
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
        {Math.round(filled * 100)}
      </text>
    </svg>
  );
}
