import { useQuery } from '@tanstack/react-query';
import { useWalletStore } from '@/stores/walletStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useApiKeyStore } from '@/stores/apiKeyStore';

export function useOnchainData() {
  const wallets = useWalletStore((s) => s.wallets);
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  const getHeaders = useApiKeyStore((s) => s.getHeaders);

  return useQuery({
    queryKey: ['onchain', wallets],
    queryFn: async () => {
      const res = await fetch('/api/onchain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ wallets }),
      });
      if (!res.ok) {
        throw new Error('Failed to fetch on-chain data');
      }
      return res.json();
    },
    refetchOnMount: false,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    enabled: wallets.length > 0,
  });
}
