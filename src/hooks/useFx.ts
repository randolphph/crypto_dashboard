import { useQuery } from '@tanstack/react-query';
import type { FxRates } from '@/types/stocks';

interface FxResponse extends FxRates {
  lastUpdated: string;
  error?: string;
}

export function useFx() {
  return useQuery<FxResponse>({
    queryKey: ['fx'],
    queryFn: async () => {
      const res = await fetch('/api/fx');
      if (!res.ok) throw new Error('fx fetch failed');
      return res.json();
    },
    refetchOnMount: false,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
}
