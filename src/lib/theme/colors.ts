/** Shared chart roles. CSS supplies the selected palette and light/dark values. */
export const CHART_SERIES = Array.from({ length: 8 }, (_, index) => `var(--chart-${index + 1})`);

const CATEGORIES: Record<string, string> = {
  cash: 'var(--category-cash)',
  stocks: 'var(--category-stocks)',
  crypto: 'var(--category-crypto)',
  'us-stocks': 'var(--category-us-stocks)',
  gold: 'var(--category-gold)',
};

// Existing saved categories can share palette-aware color roles.
// Resolve their presentation here; names, assignments and saved data stay intact.
export function assetCategoryColor(category: { id: string }): string {
  const preset = CATEGORIES[category.id];
  if (typeof preset === 'string') return preset;
  let hash = 0;
  for (const char of category.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CHART_SERIES[hash % CHART_SERIES.length];
}
