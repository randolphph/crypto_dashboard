'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { SectorRollup } from '@/lib/accumulation/derive';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';

import { WaterCircle } from './WaterCircle';

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
  // 总体加仓进度 = AI 现值 / 目标，驱动圆环中心的水位球。
  progress: number;
  pendingBudget: number;
  // Effective highlight = hover ?? pin, computed by the parent.
  activeSector: string | null;
  onHover: (sector: string | null) => void;
  onTogglePin: (sector: string) => void;
}

export function SectorDonut({
  rollups,
  sectorColors,
  progress,
  pendingBudget,
  activeSector,
  onHover,
  onTogglePin,
}: Props) {
  const { fmtUsd, hidden, percentHidden } = usePrivacyFormat();

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
        const color = sectorColors.get(r.sector) ?? 'var(--chart-1)';
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
        fill="var(--foreground)"
        stroke={compact ? 'var(--card)' : 'none'}
        strokeWidth={compact ? 3 : 0}
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
          {percentHidden ? '**%' : `${pct}%`}
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
      {/* 水位球保留在板块圆环中心，与现有 cx/cy 对齐。 */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <WaterCircle progress={progress} pendingBudget={pendingBudget} hidden={hidden} percentHidden={percentHidden} />
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
            wrapperStyle={{ zIndex: 20 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const sector = (payload[0].payload as RingSlice).sector;
              if (!sector) return null;
              const r = rollupBySector.get(sector);
              if (!r) return null;
              const currentShare =
                totalCurrent > 0 ? r.currentValue / totalCurrent : 0;
              const color = sectorColors.get(sector) ?? 'var(--muted-foreground)';
              return (
                <div role="tooltip" data-sector-tooltip className="min-w-[320px] rounded-lg border bg-popover px-5 py-4 text-base text-popover-foreground shadow-lg">
                  <p className="flex items-center gap-2.5 text-lg font-semibold tracking-wide">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    {sector}
                    <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                      <span
                        className="h-2 w-16 overflow-hidden rounded-full"
                        style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }}
                      >
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${currentShare * 100}%`,
                            backgroundColor: color,
                          }}
                        />
                      </span>
                      当前构成 {percentHidden ? '**%' : `${(currentShare * 100).toFixed(1)}%`}
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
                            hidden={percentHidden}
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
                              {percentHidden
                                ? '**%'
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
        fill="var(--foreground)"
      >
        {hidden ? '•' : Math.round(filled * 100)}
      </text>
    </svg>
  );
}
