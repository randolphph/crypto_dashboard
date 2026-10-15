import { useQuery } from '@tanstack/react-query';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { readApiError } from '@/lib/fetchError';
import { useMemo } from 'react';
import { useAssetStockMappingStore } from '@/stores/assetStockMappingStore';
import { annotateExchange } from '@/lib/portfolio/assetStockMapping';
import { useAssetCategoryStore } from '@/stores/assetCategoryStore';
import { resolveUsStockSymbol } from '@/lib/portfolio/assetCategories';

const EXCHANGE_LABEL: Record<'binance' | 'okx' | 'deribit', string> = {
  binance: 'Binance',
  okx: 'OKX',
  deribit: 'Deribit',
};

export function useExchangeData(exchange: 'binance' | 'okx' | 'deribit') {
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  const getHeaders = useApiKeyStore((s) => s.getHeaders);
  const mappings = useAssetStockMappingStore((s) => s.mappings);
  const categoryConfig = useAssetCategoryStore();

  const query = useQuery({
    queryKey: ['exchange', exchange],
    queryFn: async () => {
      const res = await fetch(`/api/exchanges/${exchange}`, {
        headers: getHeaders(),
      });
      if (!res.ok) {
        throw await readApiError(res, EXCHANGE_LABEL[exchange]);
      }
      return res.json();
    },
    // Settings can change while this query is unmounted. Refresh on return
    // so a cached "not configured" result cannot keep hiding the exchange.
    refetchOnMount: 'always',
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
  });
  const data = useMemo(() => query.data && exchange !== 'deribit' ? annotateExchange(query.data, exchange, mappings, (id, known) => resolveUsStockSymbol(categoryConfig, id, known)) : query.data, [query.data, exchange, mappings, categoryConfig]);
  return { ...query, data };
}
