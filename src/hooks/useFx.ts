import { useQuery } from '@tanstack/react-query';
import { readApiError } from '@/lib/fetchError';
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
      if (!res.ok) throw await readApiError(res, '汇率');
      return res.json();
    },
    refetchOnMount: false,
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
  });
}
