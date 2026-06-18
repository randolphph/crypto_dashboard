'use client';

import { useState, useMemo, useEffect, useId } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { useCustomAssetStore, type CustomAsset } from '@/stores/customAssetStore';
import { usePortfolioHistoryStore } from '@/stores/portfolioHistoryStore';
import { useCashFlowStore, netFlowInRange } from '@/stores/cashFlowStore';
import { PortfolioChart } from './PortfolioChart';

interface BreakdownItem {
  label: string;
  value: number;
  details?: BreakdownItem[];
}

interface PortfolioSummaryProps {
  totalValue: number;
  breakdown: BreakdownItem[];
  categoryBreakdown: BreakdownItem[];
  positionBreakdown: BreakdownItem[];
  isLoading: boolean;
}

const COLORS = [
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#f97316', // orange
];

// Stable color per category so the strip and the pie agree even when slice
// order changes session to session.
const CATEGORY_COLORS: Record<string, string> = {
  加密: '#f59e0b', // amber
  股票: '#3b82f6', // blue
  现金: '#10b981', // emerald
  其它: '#8b5cf6', // violet
};

function categoryColor(label: string, fallbackIdx: number): string {
  return CATEGORY_COLORS[label] ?? COLORS[fallbackIdx % COLORS.length];
}

// Direction-aware palette: greens for longs, reds for shorts, neutral hues
// for spot. Picked so the eye can tell at a glance whether exposure is net
// long or net short before reading any labels.
const POSITION_COLORS: Record<string, string> = {
  加密现货: '#f59e0b', // amber — matches the 加密 category color
  做多合约: '#10b981', // emerald
  做空合约: '#ef4444', // red
  交易期权: '#06b6d4', // cyan
  股票现货: '#3b82f6', // blue — matches the 股票 category color
  股票空仓: '#8b5cf6', // violet
};

function positionColor(label: string, fallbackIdx: number): string {
  return POSITION_COLORS[label] ?? COLORS[fallbackIdx % COLORS.length];
}

// "今日" delta = current total vs. the snapshot closest to 24h ago,
// adjusted for any cash deposits/withdrawals in the window so we measure
// real performance (a $1k deposit isn't a $1k gain). If we don't have a
// snapshot older than 24h yet, fall back to the oldest one we have and
// label it with the actual age so the user knows the window is short.
interface TodayDelta {
  delta: number;
  pct: number;
  hours: number;
  short: boolean;
}

function useTodayDelta(totalValue: number): TodayDelta | null {
  const snapshots = usePortfolioHistoryStore((s) => s.snapshots);
  const cashFlowEvents = useCashFlowStore((s) => s.events);
  // Snapshots persist in localStorage; avoid hydration mismatch by gating
  // on client mount before reading from the store.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return useMemo(() => {
    if (!mounted) return null;
    if (totalValue <= 0 || snapshots.length === 0) return null;
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    const before = snapshots
      .filter((s) => s.timestamp <= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const oldest = [...snapshots].sort((a, b) => a.timestamp - b.timestamp)[0];
    const baseline = before ?? oldest;
    if (!baseline || baseline.value <= 0) return null;
    const hours = (now - baseline.timestamp) / (60 * 60 * 1000);
    // Require at least 30 min of history to avoid showing wildly noisy
    // sub-window deltas right after first login.
    if (hours < 0.5) return null;
    const raw = totalValue - baseline.value;
    const net = netFlowInRange(cashFlowEvents, baseline.timestamp, now);
    const delta = raw - net;
    const pct = (delta / baseline.value) * 100;
    return { delta, pct, hours, short: !before };
  }, [mounted, snapshots, cashFlowEvents, totalValue]);
}

function TodayDeltaLine({ delta }: { delta: TodayDelta }) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const positive = delta.delta >= 0;
  const label = delta.short
    ? delta.hours < 1
      ? `${Math.round(delta.hours * 60)} 分钟`
      : `${Math.round(delta.hours)} 小时`
    : '今日';
  return (
    <p
      className={`text-sm font-medium tabular-nums ${
        positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      }`}
    >
      {hidden ? (
        '******'
      ) : (
        <>
          {positive ? '+' : ''}
          {fmtUsd(delta.delta)} ({positive ? '+' : ''}
          {delta.pct.toFixed(2)}%)
        </>
      )}
      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
        {label}
      </span>
    </p>
  );
}

function PieChart({
  breakdown,
  totalValue,
  colorFor,
  activeLabel,
  onHover,
}: {
  breakdown: BreakdownItem[];
  totalValue: number;
  colorFor: (label: string, idx: number) => string;
  activeLabel?: string | null;
  onHover?: (label: string | null) => void;
}) {
  const { hidden } = usePrivacyFormat();
  // Each PieChart instance gets its own SVG mask id so two pies on the same
  // page (category + position) don't fight over the same animation mask.
  const maskId = useId();
  const items = breakdown.filter((b) => b.value > 0);
  if (items.length === 0 || totalValue <= 0) return null;

  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 56;
  const hasActive = activeLabel != null;

  let cumulative = 0;
  const slices = items.map((item, i) => {
    const fraction = item.value / totalValue;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const fill = colorFor(item.label, i);
    const drillable = !!item.details?.length;
    const dim = hasActive && activeLabel !== item.label ? 0.3 : 1;
    const onMouseEnter = drillable && onHover
      ? () => onHover(item.label)
      : undefined;
    const onMouseLeave = drillable && onHover
      ? () => onHover(null)
      : undefined;

    if (fraction >= 0.9999) {
      return (
        <circle
          key={item.label}
          cx={cx}
          cy={cy}
          r={r}
          fill={fill}
          opacity={dim}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        />
      );
    }

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return (
      <path
        key={item.label}
        d={d}
        fill={fill}
        opacity={dim}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    );
  });

  const maskR = r / 2;
  const circumference = 2 * Math.PI * maskR;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <mask id={maskId}>
            <circle
              cx={cx}
              cy={cy}
              r={maskR}
              fill="none"
              stroke="white"
              strokeWidth={r + 2}
              strokeDasharray={circumference}
              strokeDashoffset={circumference}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <animate
                attributeName="stroke-dashoffset"
                from={circumference}
                to={0}
                dur="0.8s"
                fill="freeze"
                calcMode="spline"
                keySplines="0.25 0.1 0.25 1"
              />
            </circle>
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          {slices}
        </g>
      </svg>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => {
          const drillable = !!item.details?.length;
          const isActive = activeLabel === item.label;
          const dim = hasActive && !isActive;
          return (
            <div
              key={item.label}
              onMouseEnter={() => drillable && onHover?.(item.label)}
              onMouseLeave={() => drillable && onHover?.(null)}
              className={`flex items-center gap-2 text-sm -mx-1 px-1 rounded-sm transition-opacity ${
                drillable ? 'hover:bg-secondary/60' : ''
              } ${dim ? 'opacity-50' : ''}`}
            >
              <span
                className="inline-block h-3 w-3 rounded-sm shrink-0"
                style={{ backgroundColor: colorFor(item.label, i) }}
              />
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium tabular-nums">
                {hidden ? '**%' : `${((item.value / totalValue) * 100).toFixed(1)}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryTooltip({
  category,
  color,
}: {
  category: BreakdownItem;
  color: string;
}) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const details = (category.details ?? []).filter((d) => d.value > 0);
  if (details.length === 0) return null;
  const categoryTotal = category.value;

  return (
    <div
      // Bottom-center placement: with two pies side-by-side, a left-anchored
      // tooltip would collide with the neighboring pie. pointer-events:none
      // keeps the cursor "ownership" with the slice so moving toward the
      // tooltip doesn't fire mouseLeave on it.
      role="tooltip"
      className="absolute top-full left-1/2 -translate-x-1/2 mt-3 z-10 w-60 rounded-lg border bg-popover shadow-lg p-3 pointer-events-none"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium truncate">{category.label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {fmtUsd(categoryTotal)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {details.map((d) => {
          const pct = categoryTotal > 0 ? (d.value / categoryTotal) * 100 : 0;
          return (
            <div
              key={d.label}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-muted-foreground truncate">{d.label}</span>
              <div className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
                <span className="font-medium text-foreground">
                  {fmtUsd(d.value)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {hidden ? '**%' : `${pct.toFixed(1)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InlineEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { name: string; value: number };
  onSave: (name: string, value: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [value, setValue] = useState(initial ? String(initial.value) : '');

  function handleSave() {
    const v = parseFloat(value);
    if (!name.trim() || isNaN(v) || v <= 0) return;
    onSave(name.trim(), v);
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        className="w-20 rounded border bg-background px-1.5 py-0.5 text-xs"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名称"
        autoFocus
      />
      <input
        className="w-24 rounded border bg-background px-1.5 py-0.5 text-xs tabular-nums"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="number"
        min="0"
        placeholder="金额 (USD)"
      />
      <button onClick={handleSave} className="text-green-600 hover:text-green-500">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CustomAssetItem({
  asset,
  onEdit,
  onDelete,
}: {
  asset: CustomAsset;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { fmtUsd } = usePrivacyFormat();
  return (
    <div className="flex flex-col gap-0.5 group relative">
      <div className="flex items-center gap-1">
        <p className="text-xs text-muted-foreground">{asset.name}</p>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground">
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      <p className="text-sm font-medium">{fmtUsd(asset.value)}</p>
    </div>
  );
}

export function PortfolioSummary({
  totalValue,
  breakdown,
  categoryBreakdown,
  positionBreakdown,
  isLoading,
}: PortfolioSummaryProps) {
  const { assets, addAsset, removeAsset, updateAsset } = useCustomAssetStore();
  const { fmtUsd, hidden } = usePrivacyFormat();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredPosition, setHoveredPosition] = useState<string | null>(null);

  // Split breakdown into API items and custom items
  const customLabels = new Set(assets.map((a) => a.name));
  const apiBreakdown = breakdown.filter((b) => !customLabels.has(b.label));
  const showCategoryStrip = categoryBreakdown.length > 0 && totalValue > 0;
  // Position pie has its own total — slices are sized relative to the sum of
  // non-cash exposure, not the global portfolio total, so percentages add to
  // 100% within the pie regardless of how much cash sits on the side.
  const positionTotal = positionBreakdown.reduce((s, p) => s + p.value, 0);

  const hoveredDetail = hoveredCategory
    ? categoryBreakdown.find((c) => c.label === hoveredCategory)
    : null;
  const hoveredPositionDetail = hoveredPosition
    ? positionBreakdown.find((p) => p.label === hoveredPosition)
    : null;

  const todayDelta = useTodayDelta(totalValue);

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        {/* Left: total value + category-level strip */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">总资产价值</p>
            {isLoading ? (
              <div className="h-9 w-48 animate-pulse rounded bg-muted" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">
                {fmtUsd(totalValue)}
              </p>
            )}
            {!isLoading && todayDelta && (
              <TodayDeltaLine delta={todayDelta} />
            )}
          </div>

          {/* Category strip — the "where are my eggs" answer in one row.
              Items with `details` reveal a hover tooltip beside the pie. */}
          {showCategoryStrip && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {categoryBreakdown.map((item, i) => {
                const pct = (item.value / totalValue) * 100;
                const drillable = !!item.details?.length;
                const isActive = hoveredCategory === item.label;
                const dim = hoveredCategory != null && !isActive;
                return (
                  <div
                    key={item.label}
                    onMouseEnter={() =>
                      drillable && setHoveredCategory(item.label)
                    }
                    onMouseLeave={() => setHoveredCategory(null)}
                    className={`flex items-center gap-2 -mx-1 px-1 rounded-sm transition-opacity ${
                      drillable ? 'hover:bg-secondary/60' : ''
                    } ${dim ? 'opacity-50' : ''}`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: categoryColor(item.label, i) }}
                    />
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {fmtUsd(item.value)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {hidden ? '**%' : `${pct.toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Position pie — non-cash exposure broken down by direction. Sits
            to the left of the category pie so the eye reads "what kinds of
            positions do I have" before the higher-level category split.
            Each bucket carries `details` so hovering reveals where the
            exposure actually lives (which exchange, which symbol). */}
        {!isLoading && positionBreakdown.length > 0 && positionTotal > 0 && (
          <div className="relative">
            {hoveredPositionDetail && (
              <CategoryTooltip
                category={hoveredPositionDetail}
                color={positionColor(hoveredPositionDetail.label, 0)}
              />
            )}
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              仓位构成
            </p>
            <PieChart
              breakdown={positionBreakdown}
              totalValue={positionTotal}
              colorFor={positionColor}
              activeLabel={hoveredPosition}
              onHover={setHoveredPosition}
            />
          </div>
        )}

        {/* Right: category pie + floating drill-down tooltip on its left.
            `relative` here anchors the tooltip's `right-full` positioning. */}
        {!isLoading && categoryBreakdown.length > 0 && (
          <div className="relative">
            {hoveredDetail && (
              <CategoryTooltip
                category={hoveredDetail}
                color={categoryColor(hoveredDetail.label, 0)}
              />
            )}
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              资产分布
            </p>
            <PieChart
              breakdown={categoryBreakdown}
              totalValue={totalValue}
              colorFor={categoryColor}
              activeLabel={hoveredCategory}
              onHover={setHoveredCategory}
            />
          </div>
        )}
      </div>

      {/* Per-source breakdown row — secondary detail under the category strip. */}
      {(breakdown.length > 0 || assets.length > 0) && (
        <div className="mt-6 pt-4 border-t">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">
            分账户
          </p>
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            {apiBreakdown.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-medium tabular-nums">{fmtUsd(item.value)}</p>
              </div>
            ))}

            {assets.map((asset) =>
              editingId === asset.id ? (
                <InlineEditor
                  key={asset.id}
                  initial={{ name: asset.name, value: asset.value }}
                  onSave={(name, value) => {
                    updateAsset(asset.id, { name, value });
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <CustomAssetItem
                  key={asset.id}
                  asset={asset}
                  onEdit={() => setEditingId(asset.id)}
                  onDelete={() => removeAsset(asset.id)}
                />
              )
            )}

            {adding ? (
              <InlineEditor
                onSave={(name, value) => {
                  addAsset({ id: crypto.randomUUID(), name, value });
                  setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary transition-colors self-center"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Portfolio value history chart */}
      <PortfolioChart />
    </div>
  );
}
