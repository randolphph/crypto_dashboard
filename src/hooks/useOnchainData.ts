import { useQuery } from '@tanstack/react-query';
import { useWalletStore } from '@/stores/walletStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { useReceiptTokenStore } from '@/stores/receiptTokenStore';
import { readApiError } from '@/lib/fetchError';

export function useOnchainData() {
  const wallets = useWalletStore((s) => s.wallets);
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  const getHeaders = useApiKeyStore((s) => s.getHeaders);
  const receiptTokenEntries = useReceiptTokenStore((s) => s.entries);

  return useQuery({
    queryKey: ['onchain', wallets, receiptTokenEntries],
    queryFn: async () => {
      const receiptTokenAddresses = receiptTokenEntries.map(
        ({ chainId, tokenAddress }) => ({ chainId, tokenAddress })
      );
      const res = await fetch('/api/onchain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ wallets, receiptTokenAddresses }),
      });
      if (!res.ok) {
        throw await readApiError(res, '链上数据');
      }
      return res.json();
    },
    refetchOnMount: false,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
    enabled: wallets.length > 0,
  });
}
