import { useQuery } from '@tanstack/react-query';
import { useStockPositionStore } from '@/stores/stockPositionStore';
import { useCashBalanceStore } from '@/stores/cashBalanceStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import type { StocksData } from '@/types/stocks';

export function useStockData() {
  const positions = useStockPositionStore((s) => s.positions);
  const cash = useCashBalanceStore((s) => s.balances);
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);

  return useQuery<StocksData>({
    queryKey: ['stocks', positions, cash],
    queryFn: async () => {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions, cash }),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch stock data');
      }
      return res.json();
    },
    refetchOnMount: false,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    enabled: positions.length > 0 || cash.length > 0,
  });
}
