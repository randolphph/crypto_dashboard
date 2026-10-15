'use client';

import { useState, useMemo, useEffect, useId } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  LoaderCircle,
} from 'lucide-react';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { useCustomAssetStore, type CustomAsset } from '@/stores/customAssetStore';
import { usePortfolioHistoryStore } from '@/stores/portfolioHistoryStore';
import { useCashFlowStore, netFlowInRange } from '@/stores/cashFlowStore';
import { PortfolioChart } from './PortfolioChart';
import type { HistoryRecording } from '@/lib/portfolio/history';
import { SourceIcon } from './SourceIcon';
import { AssetCategoryManager } from './AssetCategoryManager';
import { AssetCategorySelect } from './AssetCategorySelect';
import { customCategoryKey, type ClassificationAsset } from '@/lib/portfolio/assetCategories';

interface BreakdownItem {
  label: string;
  value: number;
  isLoading?: boolean;
  details?: BreakdownItem[];
  color?: string;
}

interface PortfolioSummaryProps {
  totalValue: number;
  assetsValue: number;
  liabilitiesValue?: number;
  breakdown: BreakdownItem[];
  categoryBreakdown: BreakdownItem[];
  classificationAssets: ClassificationAsset[];
  isLoading: boolean;
  historyRecording: HistoryRecording;
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
    if (!Number.isFinite(totalValue) || snapshots.length === 0) return null;
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
  groupBelowUsd = 0,
}: {
  category: BreakdownItem;
  color: string;
  groupBelowUsd?: number;
}) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const rawDetails = (category.details ?? []).filter((d) => d.value !== 0);
  const details = (() => {
    if (groupBelowUsd <= 0) return rawDetails;

    const visible: BreakdownItem[] = [];
    let otherValue = 0;
    for (const detail of rawDetails) {
      if (Math.abs(detail.value) < groupBelowUsd || detail.label === '其它') {
        otherValue += detail.value;
      } else {
        visible.push(detail);
      }
    }
    if (otherValue !== 0) {
      visible.push({ label: '其它', value: otherValue });
    }
    return visible;
  })();
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
              <span className="flex items-center gap-1.5 min-w-0">
                <SourceIcon label={d.label} className="h-3 w-3" />
                <span className="text-muted-foreground truncate">{d.label}</span>
              </span>
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

function ManualAssetAllocation({ breakdown, assets }: { breakdown: BreakdownItem[]; assets: ClassificationAsset[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const positive = breakdown.filter((item) => item.value > 0);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  const active = positive.find((item) => item.label === hovered);
  const colorFor = (label: string, index: number) => breakdown.find((item) => item.label === label)?.color ?? categoryColor(label, index);
  return <div className="min-w-0 border-t pt-5 md:w-[460px] md:shrink-0 md:border-l md:border-t-0 md:pl-6 md:pt-0">
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-sm font-semibold">资产分布</h2><p className="mt-1 text-xs text-muted-foreground">按资产分类直接汇总，修改标签后即时更新。</p></div>
      <AssetCategoryManager assets={assets} />
    </div>
    {total > 0 ? <div className="relative flex justify-center md:justify-start">
      {active && <CategoryTooltip category={active} color={colorFor(active.label, 0)} />}
      <PieChart breakdown={positive} totalValue={total} colorFor={colorFor} activeLabel={hovered} onHover={setHovered} />
    </div> : <p className="rounded-lg border border-dashed px-4 py-5 text-center text-xs text-muted-foreground">暂无可绘制的资产数据</p>}
    {breakdown.some((item) => item.value < 0) && <p className="mt-2 text-xs text-muted-foreground">负值分类已保留在资产合计中；饼图比例仅按正值分类计算。</p>}
  </div>;
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
        <SourceIcon label={asset.name} kind="other" />
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
      <AssetCategorySelect assetId={customCategoryKey(asset.id)} label={asset.name} />
    </div>
  );
}

export function PortfolioSummary({
  totalValue,
  assetsValue,
  liabilitiesValue,
  breakdown,
  categoryBreakdown,
  classificationAssets,
  isLoading,
  historyRecording,
}: PortfolioSummaryProps) {
  const { assets, addAsset, removeAsset, updateAsset } = useCustomAssetStore();
  const { fmtUsd, hidden } = usePrivacyFormat();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Split breakdown into API items and custom items
  const customLabels = new Set(assets.map((a) => a.name));
  const apiBreakdown = breakdown.filter((b) => !customLabels.has(b.label));
  const showCategoryStrip = categoryBreakdown.length > 0 && assetsValue > 0;

  const todayDelta = useTodayDelta(totalValue);

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        {/* Left: total value + category-level strip */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">净资产</p>
            {isLoading ? (
              <div className="h-9 w-48 animate-pulse rounded bg-muted" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">
                {Number.isFinite(totalValue) ? fmtUsd(totalValue) : '—'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">资产合计 {fmtUsd(assetsValue)} · 负债合计 {liabilitiesValue === undefined ? '—（汇率不可用）' : fmtUsd(liabilitiesValue)}</p>
            {!isLoading && todayDelta && (
              <TodayDeltaLine delta={todayDelta} />
            )}
          </div>

          {/* Category strip — the compact "where are my eggs" answer. */}
          {showCategoryStrip && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {categoryBreakdown.map((item, i) => {
                const pct = (item.value / assetsValue) * 100;
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-2"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: item.color ?? categoryColor(item.label, i) }}
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

        <ManualAssetAllocation breakdown={categoryBreakdown} assets={classificationAssets} />
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
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <SourceIcon label={item.label} />
                  {item.label}
                </p>
                <p className="inline-flex h-5 items-center text-sm font-medium tabular-nums">
                  {item.isLoading ? (
                    <span role="status" aria-label={`${item.label} 金额加载中`}>
                      <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                    </span>
                  ) : fmtUsd(item.value)}
                </p>
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
      <PortfolioChart recording={historyRecording} />
    </div>
  );
}
