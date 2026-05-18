import { useQuery } from '@tanstack/react-query';
import { useStockPositionStore } from '@/stores/stockPositionStore';
import { useCashBalanceStore } from '@/stores/cashBalanceStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import type { StocksData } from '@/types/stocks';

export function useStockData() {
  const positions = useStockPositionStore((s) => s.positions);
  const cash = useCashBalanceStore((s) => s.balances);
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  const getHeaders = useApiKeyStore((s) => s.getHeaders);
  const longportConfigured = useApiKeyStore(
    (s) => !!(s.longportAppKey && s.longportAppSecret && s.longportAccessToken)
  );
  const ibkrConfigured = useApiKeyStore(
    (s) => !!(s.ibkrFlexToken && s.ibkrFlexQueryId)
  );

  return useQuery<StocksData>({
    queryKey: ['stocks', positions, cash, longportConfigured, ibkrConfigured],
    queryFn: async () => {
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ positions, cash }),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch stock data');
      }
      return res.json();
    },
    refetchOnMount: false,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    enabled:
      positions.length > 0 ||
      cash.length > 0 ||
      longportConfigured ||
      ibkrConfigured,
  });
}
