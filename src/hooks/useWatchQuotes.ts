'use client';

import { useQuery } from '@tanstack/react-query';
import { useDashboardStore } from '@/stores/dashboardStore';
import type { StockMarket, StockQuote } from '@/types/stocks';

export interface WatchSymbol {
  market: StockMarket;
  symbol: string;
}

// Quotes for加仓 watch-list names you don't hold yet (held names already come
// from the shared useStockData() feed, so they're deliberately excluded by the
// caller). Keyed only on the symbol set, so it refetches when the plan's
// not-held names change but stays cached otherwise.
export function useWatchQuotes(symbols: WatchSymbol[]) {
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  // Stable key independent of array identity.
  const key = symbols
    .map((s) => `${s.market}:${s.symbol.trim().toUpperCase()}`)
    .sort()
    .join(',');

  return useQuery<StockQuote[]>({
    queryKey: ['watch-quotes', key],
    queryFn: async () => {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      if (!res.ok) return [];
      const json = (await res.json()) as { quotes?: StockQuote[] };
      return json.quotes ?? [];
    },
    enabled: symbols.length > 0,
    refetchOnMount: false,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
  });
}
