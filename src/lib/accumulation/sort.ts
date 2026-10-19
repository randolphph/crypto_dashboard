import type { DerivedTarget } from './derive';

export type TargetSortKey = 'symbol' | 'sector' | 'currentValue' | 'tier' | 'pnlUsd';

export function sortTargets(
  targets: DerivedTarget[],
  key: TargetSortKey,
  ascending: boolean,
  activeSector?: string | null
): DerivedTarget[] {
  return [...targets].sort((a, b) => {
    if (activeSector) {
      const am = (a.target.sector || '未分类') === activeSector ? 0 : 1;
      const bm = (b.target.sector || '未分类') === activeSector ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    const av = key === 'tier' ? a.nearestTierLevel
      : key === 'symbol' || key === 'sector' ? a.target[key] : a[key];
    const bv = key === 'tier' ? b.nearestTierLevel
      : key === 'symbol' || key === 'sector' ? b.target[key] : b[key];
    // Unknown PnL is never zero profit, including when sorting losses first.
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    const direction = ascending ? 1 : -1;
    if (typeof av === 'string' && typeof bv === 'string') {
      const byText = direction * av.localeCompare(bv);
      if (byText) return byText;
    } else if (typeof av === 'number' && typeof bv === 'number' && av !== bv) {
      return direction * (av - bv);
    }
    if (key === 'tier' && a.proximity !== b.proximity) return b.proximity - a.proximity;
    return a.target.symbol.localeCompare(b.target.symbol);
  });
}
