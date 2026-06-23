'use client';

import { useQuery } from '@tanstack/react-query';
import { useDashboardStore } from '@/stores/dashboardStore';
import type { StockMarket } from '@/types/stocks';

export interface Ma20Symbol {
  market: StockMarket;
  symbol: string;
}

// Real 20-day moving averages for the plan's symbols, computed server-side from
// Yahoo daily closes. Keyed "MARKET:SYMBOL"; missing entries mean "fall back to
// the manual ma20". Server caches an hour, so polling here is cheap.
export function useMa20(symbols: Ma20Symbol[]) {
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  const key = symbols
    .map((s) => `${s.market}:${s.symbol.trim().toUpperCase()}`)
    .sort()
    .join(',');

  return useQuery<Record<string, number>>({
    queryKey: ['ma20', key],
    queryFn: async () => {
      const res = await fetch('/api/ma20', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      if (!res.ok) return {};
      const json = (await res.json()) as { ma20?: Record<string, number> };
      return json.ma20 ?? {};
    },
    enabled: symbols.length > 0,
    refetchOnMount: false,
    // MA20 changes daily; refresh on the dashboard cadence but no faster than
    // a few minutes (server cache absorbs the rest).
    refetchInterval: refreshInterval > 0 ? Math.max(refreshInterval, 300) * 1000 : false,
    staleTime: 5 * 60 * 1000,
  });
}
