import type { SectorRollup } from '@/lib/accumulation/derive';

// Shared by the sector donut and target table so a sector keeps the same hue
// everywhere in the accumulation view.
const SECTOR_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#10b981',
  '#8b5cf6',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#f97316',
];

export function buildSectorColorMap(
  rollups: readonly SectorRollup[]
): ReadonlyMap<string, string> {
  return new Map(
    rollups.map((rollup, index) => [
      rollup.sector,
      SECTOR_COLORS[index % SECTOR_COLORS.length],
    ])
  );
}
