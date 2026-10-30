import type { AssetCategoryDetail } from './assetCategories';

const wholeUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const formatAllocationUsd = (value: number) => wholeUsd.format(Math.abs(value) < .5 ? 0 : value);

export interface TopHolding extends AssetCategoryDetail { id: string; categories: string[]; share: number }

/** Exclude cash only from ranking; all shares use the dashboard's full asset valuation. */
export function buildTopHoldings(buckets: Array<{ id?: string; label: string; details?: AssetCategoryDetail[] }>, totalAssetsValue: number) {
  const holdings = new Map<string, Omit<TopHolding, 'share'>>();
  for (const bucket of buckets) {
    if (bucket.id === 'cash') continue;
    for (const detail of bucket.details ?? []) {
      if (detail.aggregateOnly || !Number.isFinite(detail.value)) continue;
      const id = detail.id ?? JSON.stringify(['detail', detail.label]);
      const current = holdings.get(id);
      if (!current) {
        holdings.set(id, { ...detail, id, label: detail.assetLabel ?? detail.displayLabel ?? detail.label,
          categories: [bucket.label], locations: [...(detail.locations ?? [])], sources: (detail.sources ?? []).map(source => ({ ...source })) });
      } else {
        current.value += detail.value;
        current.merged = true;
        current.icon ??= detail.icon;
        if (!current.categories.includes(bucket.label)) current.categories.push(bucket.label);
        for (const location of detail.locations ?? []) if (!current.locations!.includes(location)) current.locations!.push(location);
        for (const source of detail.sources ?? []) {
          const existing = current.sources!.find(row => row.label === source.label);
          if (existing) existing.value += source.value;
          else current.sources!.push({ ...source });
        }
      }
    }
  }
  const all = [...holdings.values()].filter(row => row.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.id.localeCompare(b.id));
  const shareBase = Number.isFinite(totalAssetsValue) && totalAssetsValue > 0 ? totalAssetsValue : 0;
  const rows: TopHolding[] = all.slice(0, 6).map(row => ({ ...row, share: shareBase > 0 ? Math.abs(row.value) / shareBase * 100 : 0 }));
  return { rows, count: all.length, totalAssetsValue: shareBase, topAbsoluteValue: rows.reduce((sum, row) => sum + Math.abs(row.value), 0) };
}

/** A shared monetary unit; the last dot's area retains the exact fraction. */
export function holdingDotScale(values: number[]) {
  const max = Math.max(0, ...values.filter(Number.isFinite).map(Math.abs));
  const rough = max / 10;
  const power = rough > 0 ? 10 ** Math.floor(Math.log10(rough)) : 1;
  const unit = Math.max(1, [1, 2, 2.5, 5, 10].map(n => n * power).find(value => value >= rough) ?? power * 10);
  return { unit, fractions: values.map(value => {
    const count = Number.isFinite(value) ? Math.abs(value) / unit : 0;
    return Array.from({ length: Math.ceil(count) }, (_, index) => Math.min(1, count - index));
  }) };
}
