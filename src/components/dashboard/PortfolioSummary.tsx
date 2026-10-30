'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { AssetAllocationPie } from './AssetAllocationPie';
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
  const { fmtUsd, hidden, percentHidden } = usePrivacyFormat();
  const positive = delta.delta >= 0;
  const label = delta.short
    ? delta.hours < 1
      ? `${Math.round(delta.hours * 60)} 分钟`
      : `${Math.round(delta.hours)} 小时`
    : '今日';
  return (
    <p
      className={`text-sm font-medium tabular-nums ${
        positive ? 'text-positive dark:text-positive classic:text-green-600 classic:dark:text-green-400' : 'text-negative dark:text-negative classic:text-red-600 classic:dark:text-red-400'
      }`}
    >
      {hidden ? '******' : `${positive ? '+' : ''}${fmtUsd(delta.delta)}`} ({percentHidden ? '**%' : `${positive ? '+' : ''}${delta.pct.toFixed(2)}%`})
      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
        {label}
      </span>
    </p>
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
      <button onClick={handleSave} className="text-positive hover:text-positive classic:text-green-600 classic:hover:text-green-500">
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
  const { fmtUsd } = usePrivacyFormat();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Split breakdown into API items and custom items
  const customLabels = new Set(assets.map((a) => a.name));
  const apiBreakdown = breakdown.filter((b) => !customLabels.has(b.label));

  const todayDelta = useTodayDelta(totalValue);

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div data-portfolio-overview className="grid grid-cols-1 items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[200px_340px_minmax(0,1fr)] xl:grid-cols-[220px_360px_minmax(0,1fr)]">
        <div data-net-assets className="min-w-0">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">净资产</p>
            {isLoading ? (
              <div className="h-9 w-48 animate-pulse rounded bg-muted" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">
                {Number.isFinite(totalValue) ? fmtUsd(totalValue) : '—'}
              </p>
            )}
            <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">资产合计 {Number.isFinite(assetsValue) ? fmtUsd(assetsValue) : '—'}</span>
              <span className="whitespace-nowrap">负债合计 {liabilitiesValue === undefined ? '—（汇率不可用）' : fmtUsd(liabilitiesValue)}</span>
            </p>
            {!isLoading && todayDelta && (
              <TodayDeltaLine delta={todayDelta} />
            )}
          </div>
        </div>

        <AssetAllocationPie breakdown={categoryBreakdown} assets={classificationAssets} totalAssetsValue={assetsValue} />
      </div>

      {/* Per-source breakdown row beneath the overview. */}
      {(breakdown.length > 0 || assets.length > 0) && (
        <div className="mt-6 pt-4 border-t">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground classic:text-muted-foreground/70 mb-2">
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
                  ) : Number.isFinite(item.value) ? fmtUsd(item.value) : '—'}
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

      <PortfolioChart recording={historyRecording} />
    </div>
  );
}
