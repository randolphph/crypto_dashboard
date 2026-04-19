'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { formatUsd } from '@/lib/format';
import { useCustomAssetStore, type CustomAsset } from '@/stores/customAssetStore';
import { PortfolioChart } from './PortfolioChart';

interface PortfolioSummaryProps {
  totalValue: number;
  breakdown: { label: string; value: number }[];
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

function PieChart({
  breakdown,
  totalValue,
}: {
  breakdown: { label: string; value: number }[];
  totalValue: number;
}) {
  const items = breakdown.filter((b) => b.value > 0);
  if (items.length === 0 || totalValue <= 0) return null;

  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 56;

  let cumulative = 0;
  const slices = items.map((item, i) => {
    const fraction = item.value / totalValue;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += fraction;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;

    if (fraction >= 0.9999) {
      return (
        <circle key={item.label} cx={cx} cy={cy} r={r} fill={COLORS[i % COLORS.length]} />
      );
    }

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return <path key={item.label} d={d} fill={COLORS[i % COLORS.length]} />;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices}
      </svg>
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium tabular-nums">
              {((item.value / totalValue) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
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
      <p className="text-sm font-medium">{formatUsd(asset.value)}</p>
    </div>
  );
}

export function PortfolioSummary({
  totalValue,
  breakdown,
  isLoading,
}: PortfolioSummaryProps) {
  const { assets, addAsset, removeAsset, updateAsset } = useCustomAssetStore();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Split breakdown into API items and custom items
  const customLabels = new Set(assets.map((a) => a.name));
  const apiBreakdown = breakdown.filter((b) => !customLabels.has(b.label));

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        {/* Left: total value + breakdown */}
        <div>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">总资产价值</p>
            {isLoading ? (
              <div className="h-9 w-48 animate-pulse rounded bg-muted" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">
                {formatUsd(totalValue)}
              </p>
            )}
          </div>
          {(breakdown.length > 0 || assets.length > 0) && (
            <div className="mt-4 flex flex-wrap items-end gap-4">
              {/* API breakdown items */}
              {apiBreakdown.map((item) => (
                <div key={item.label} className="flex flex-col gap-0.5">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{formatUsd(item.value)}</p>
                </div>
              ))}

              {/* Custom asset items */}
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

              {/* Add button / inline add form */}
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
          )}
        </div>

        {/* Right: pie chart */}
        {!isLoading && breakdown.length > 0 && (
          <PieChart breakdown={breakdown} totalValue={totalValue} />
        )}
      </div>

      {/* Portfolio value history chart */}
      {!isLoading && <PortfolioChart />}
    </div>
  );
}
