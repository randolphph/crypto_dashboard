import { CHART_SERIES } from '@/lib/theme/colors';
import type { SectorRollup } from '@/lib/accumulation/derive';

// Shared by the sector donut and target table so a sector keeps the same hue
// everywhere in the accumulation view.
export function buildSectorColorMap(
  rollups: readonly SectorRollup[]
): ReadonlyMap<string, string> {
  return new Map(
    rollups.map((rollup, index) => [
      rollup.sector,
      CHART_SERIES[index % CHART_SERIES.length],
    ])
  );
}
