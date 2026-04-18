import { useQuery } from '@tanstack/react-query';
import { useDashboardStore } from '@/stores/dashboardStore';

export function useExchangeData(exchange: 'binance' | 'okx' | 'deribit') {
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);

  return useQuery({
    queryKey: ['exchange', exchange],
    queryFn: async () => {
      const res = await fetch(`/api/exchanges/${exchange}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${exchange} data`);
      }
      return res.json();
    },
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
  });
}
