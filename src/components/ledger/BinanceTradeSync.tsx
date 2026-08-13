'use client';

import { useCallback, useEffect, useRef } from 'react';
import { fetchBinanceActivities } from '@/lib/ledger/binanceSync';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useVaultStore } from '@/stores/vaultStore';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const OVERLAP_MS = 24 * 60 * 60 * 1000;

/** Binance returns executions by symbol; stored execution IDs let overlapping
 * daily pulls safely add only newly filled trades to the day-level journal. */
export function BinanceTradeSync() {
  const vaultStatus = useVaultStore((state) => state.status);
  const apiKey = useApiKeyStore((state) => state.binanceApiKey);
  const apiSecret = useApiKeyStore((state) => state.binanceApiSecret);
  const symbols = useApiKeyStore((state) => state.binanceTradeSymbols);
  const getHeaders = useApiKeyStore((state) => state.getHeaders);
  const accounts = useLedgerStore((state) => state.accounts);
  const activities = useLedgerStore((state) => state.activities);
  const importActivities = useLedgerStore((state) => state.importActivities);
  const started = useRef(false);

  const sync = useCallback(async () => {
    const account = accounts.find(
      (candidate) => candidate.platform === 'binance' && candidate.enabled
    );
    if (!account || !apiKey || !apiSecret || !symbols.trim()) return;

    const existing = activities.filter(
      (activity) =>
        activity.accountId === account.id &&
        (activity.sourceExternalIds?.some((id) => id.startsWith('binance:')) ||
          activity.externalId?.startsWith('binance:'))
    );
    const latest = existing.reduce(
      (latestTimestamp, activity) => Math.max(latestTimestamp, activity.occurredAt),
      0
    );
    const since = latest > 0
      ? latest - OVERLAP_MS
      : Date.now() - INITIAL_LOOKBACK_MS;

    try {
      const incoming = await fetchBinanceActivities(getHeaders(), account.id, since);
      importActivities(incoming, {
        fileName: 'Binance 自动增量同步',
        errorCount: 0,
      });
    } catch (error) {
      console.warn('Binance trade sync failed:', error);
    }
  }, [accounts, activities, apiKey, apiSecret, getHeaders, importActivities, symbols]);

  useEffect(() => {
    if (vaultStatus !== 'authed' || !apiKey || !apiSecret || !symbols.trim() || started.current) return;
    started.current = true;
    void sync();
  }, [apiKey, apiSecret, symbols, sync, vaultStatus]);

  useEffect(() => {
    if (vaultStatus !== 'authed' || !apiKey || !apiSecret || !symbols.trim()) return;
    const interval = window.setInterval(() => void sync(), SYNC_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [apiKey, apiSecret, symbols, sync, vaultStatus]);

  return null;
}
