import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readApiError } from '@/lib/fetchError';
import { GOLD_REFRESH_MS, goldQuoteStatus } from '@/lib/gold/quote';
import type { GoldQuote } from '@/types/gold';

export function useGoldQuote(enabled: boolean) {
  // Local clock also ages cached prices when networking is offline/paused.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), GOLD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled]);
  const query = useQuery<GoldQuote>({
    queryKey: ['gold-quote', 'sge-au9999'],
    enabled,
    queryFn: async () => {
      const response = await fetch('/api/gold');
      if (!response.ok) throw await readApiError(response, '黄金行情');
      const quote = await response.json() as GoldQuote;
      if (goldQuoteStatus(quote) === 'unavailable') throw new Error('黄金报价无效或已过期');
      return quote;
    },
    staleTime: GOLD_REFRESH_MS,
    refetchInterval: GOLD_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  return { ...query, now };
}
