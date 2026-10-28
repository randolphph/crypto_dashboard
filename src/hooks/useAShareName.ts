'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StockQuote } from '@/types/stocks';

export function useAShareName(symbol: string, enabled: boolean, knownName = '') {
  const code = symbol.trim().toUpperCase();
  const valid = /^(?:SH|SZ|BJ)?\d{6}$/.test(code);
  const [settledCode, setSettledCode] = useState('');
  useEffect(() => {
    if (!enabled || !valid || knownName) return;
    const timer = window.setTimeout(() => setSettledCode(code), 350);
    return () => window.clearTimeout(timer);
  }, [code, enabled, valid, knownName]);

  const query = useQuery({
    queryKey: ['a-share-name', code],
    queryFn: async ({ signal }): Promise<string | null> => {
      // Name lookup is a one-off read. Omit subscription headers so typing in
      // a form cannot replace the AI watch-list's background subscriptions.
      const response = await fetch('/api/quotes', {
        method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [{ market: 'A', symbol: code }] }),
      });
      if (!response.ok) throw new Error('股票名称查询失败');
      const data = await response.json() as { quotes?: StockQuote[] };
      const quote = data.quotes?.find(q => q.market === 'A' && q.symbol.trim().toUpperCase() === code);
      return quote?.name?.trim() || null;
    },
    enabled: enabled && valid && !knownName && settledCode === code,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const name = knownName || (enabled ? query.data : '') || '';
  return {
    name,
    loading: enabled && valid && !name && !query.isError && (!query.isFetched || query.isFetching),
    unavailable: enabled && valid && !name && (query.isError || query.isFetched && !query.isFetching),
  };
}
