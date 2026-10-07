import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWalletStore } from '@/stores/walletStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { useReceiptTokenStore } from '@/stores/receiptTokenStore';
import { useVaultStore } from '@/stores/vaultStore';
import { readApiError } from '@/lib/fetchError';
import { browserSourceScope, mergeWalletResults, readBrowserWallets, writeBrowserWallets } from '@/lib/onchain/browserCache';
import { ONCHAIN_CHECK_MS } from '@/lib/onchain/cachePolicy';
import type { WalletBalance } from '@/types/onchain';

export function useOnchainData() {
  const wallets = useWalletStore((s) => s.wallets);
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  const getHeaders = useApiKeyStore((s) => s.getHeaders);
  const credentialValues = useApiKeyStore((s) => JSON.stringify([s.okxWeb3ApiKey, s.okxWeb3ApiSecret, s.okxWeb3Passphrase, s.okxWeb3ProjectId]));
  const receiptTokenEntries = useReceiptTokenStore((s) => s.entries);
  const owner = useVaultStore((s) => s.address);
  const queryClient = useQueryClient();
  const force = useRef(false);
  const [context, setContext] = useState<{ configuration: string; scope: string } | null>(null);
  // Credentials are fingerprinted before use in any persistent key or Query key.
  const configuration = JSON.stringify([owner, wallets, receiptTokenEntries, credentialValues]);
  const active = context?.configuration === configuration ? context : null;
  const scope = active?.scope ?? 'initializing';
  const queryKey = ['onchain', owner, scope, wallets, receiptTokenEntries];

  useEffect(() => {
    if (!owner || wallets.length === 0) return;
    let cancelled = false;
    const receipts = receiptTokenEntries.map(({ chainId, tokenAddress }) => ({ chainId, tokenAddress }));
    void (async () => {
      const fingerprint = await browserSourceScope(owner, JSON.parse(credentialValues));
      const key = ['onchain', owner, fingerprint, wallets, receiptTokenEntries];
      const cached = await readBrowserWallets(fingerprint, wallets, receipts).catch(() => null);
      if (cancelled) return;
      if (cached && !queryClient.getQueryData(key)) {
        queryClient.setQueryData(key, cached, { updatedAt: Math.min(...cached.filter((wallet) => wallet.dataUpdatedAt).map((wallet) => wallet.dataUpdatedAt!)) });
      }
      setContext({ configuration, scope: fingerprint });
    })();
    return () => { cancelled = true; };
  }, [owner, wallets, receiptTokenEntries, credentialValues, configuration, queryClient]);

  const query = useQuery<WalletBalance[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const receiptTokenAddresses = receiptTokenEntries.map(({ chainId, tokenAddress }) => ({ chainId, tokenAddress }));
      const res = await fetch('/api/onchain', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ wallets, receiptTokenAddresses, forceRefresh: force.current }),
      });
      if (!res.ok) throw await readApiError(res, '链上数据');
      const incoming = await res.json() as WalletBalance[];
      const data = mergeWalletResults(incoming, queryClient.getQueryData<WalletBalance[]>(queryKey));
      void writeBrowserWallets(scope, wallets, receiptTokenAddresses, data).catch(() => undefined);
      return data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    // Poll briefly while the server refreshes, then return to low-frequency reads.
    refetchInterval: (query) => query.state.data?.some((wallet) => wallet.cache?.refreshing)
      ? 5000 : refreshInterval > 0 ? ONCHAIN_CHECK_MS : false,
    retry: false,
    enabled: !!owner && !!active && wallets.length > 0,
  });

  const refreshNow = async () => {
    if (force.current || !active) return;
    force.current = true;
    try { await query.refetch(); }
    finally { force.current = false; }
  };
  return { ...query, refreshNow,
    isLoading: query.isLoading || (!!owner && wallets.length > 0 && !active) };
}
