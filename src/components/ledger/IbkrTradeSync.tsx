'use client';

import { useCallback, useEffect, useRef } from 'react';
import { fetchIbkrActivities } from '@/lib/ledger/ibkrSync';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useVaultStore } from '@/stores/vaultStore';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Ledger entries live in the browser, so syncing runs while this dashboard is
 * open. The Flex query is Last Business Day, so one daily check is sufficient.
 * Flex execution IDs make every run idempotent.
 */
export function IbkrTradeSync() {
  const vaultStatus = useVaultStore((state) => state.status);
  const token = useApiKeyStore((state) => state.ibkrFlexToken);
  const queryId = useApiKeyStore((state) => state.ibkrFlexQueryId);
  const getHeaders = useApiKeyStore((state) => state.getHeaders);
  const accounts = useLedgerStore((state) => state.accounts);
  const importActivities = useLedgerStore((state) => state.importActivities);
  const started = useRef(false);

  const sync = useCallback(async () => {
    const account = accounts.find(
      (candidate) => candidate.platform === 'ibkr' && candidate.enabled
    );
    if (!account || !token || !queryId) return;
    try {
      const activities = await fetchIbkrActivities(getHeaders(), account.id);
      importActivities(activities, {
        fileName: 'IBKR Flex 自动同步（Last Business Day）',
        errorCount: 0,
      });
    } catch (error) {
      // The user can still view / retry from the ledger. Background refreshes
      // deliberately fail quietly so a temporary Flex delay does not interrupt
      // the rest of the dashboard.
      console.warn('IBKR trade sync failed:', error);
    }
  }, [accounts, getHeaders, importActivities, queryId, token]);

  useEffect(() => {
    if (vaultStatus !== 'authed' || !token || !queryId || started.current) return;
    started.current = true;
    void sync();
  }, [queryId, sync, token, vaultStatus]);

  useEffect(() => {
    if (vaultStatus !== 'authed' || !token || !queryId) return;
    const interval = window.setInterval(() => void sync(), SYNC_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [queryId, sync, token, vaultStatus]);

  return null;
}
