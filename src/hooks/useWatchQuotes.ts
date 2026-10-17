'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useVaultStore } from '@/stores/vaultStore';
import { stockClientId, stockRequestRevision } from '@/lib/stocks/subscriptionClient';
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
  const wallet = useVaultStore((s) => s.address);
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  // Stable key independent of array identity.
  const key = symbols
    .map((s) => `${s.market}:${s.symbol.trim().toUpperCase()}`)
    .sort()
    .join(',');

  const query = useQuery<StockQuote[]>({
    queryKey: ['watch-quotes', wallet, key],
    queryFn: async () => {
      const clientId = stockClientId(wallet);
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-stock-client-id': clientId, 'x-stock-revision': stockRequestRevision(clientId) },
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
  const refetch = query.refetch;
  useEffect(() => { if (wallet && symbols.length === 0) void refetch(); }, [wallet, symbols.length, refetch]);
  return query;
}
