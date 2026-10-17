import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useVaultStore } from '@/stores/vaultStore';
import { stockClientId, stockRequestRevision } from '@/lib/stocks/subscriptionClient';
import { useStockPositionStore } from '@/stores/stockPositionStore';
import { useCashBalanceStore } from '@/stores/cashBalanceStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { readApiError } from '@/lib/fetchError';
import type { StocksData } from '@/types/stocks';

export function useStockData() {
  const wallet = useVaultStore((s) => s.address);
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

  const required = positions.length > 0 || cash.length > 0 || longportConfigured || ibkrConfigured;
  const query = useQuery<StocksData>({
    queryKey: ['stocks', wallet, positions, cash, longportConfigured, ibkrConfigured],
    queryFn: async () => {
      const clientId = stockClientId(wallet);
      const res = await fetch('/api/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders(), 'x-stock-client-id': clientId, 'x-stock-revision': stockRequestRevision(clientId) },
        body: JSON.stringify({ positions, cash }),
      });
      if (!res.ok) {
        throw await readApiError(res, '股票数据');
      }
      return res.json();
    },
    refetchOnMount: false,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    enabled: required,
  });
  // A final empty sync removes subscriptions after the last position or broker is removed.
  const refetch = query.refetch;
  useEffect(() => { if (wallet && !required) void refetch(); }, [wallet, required, refetch]);
  return { ...query, required };
}
