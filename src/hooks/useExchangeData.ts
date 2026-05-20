import { useQuery } from '@tanstack/react-query';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { readApiError } from '@/lib/fetchError';

const EXCHANGE_LABEL: Record<'binance' | 'okx' | 'deribit', string> = {
  binance: 'Binance',
  okx: 'OKX',
  deribit: 'Deribit',
};

export function useExchangeData(exchange: 'binance' | 'okx' | 'deribit') {
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  const getHeaders = useApiKeyStore((s) => s.getHeaders);

  return useQuery({
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
    refetchOnMount: false,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
  });
}
