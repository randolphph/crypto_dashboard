import { useQuery } from '@tanstack/react-query';
import type { MnavHealth, MnavInterval, MnavResponse } from '@/types/mnav';

export function useMnav(interval: MnavInterval) {
  return useQuery<MnavResponse>({
    queryKey: ['mnav', interval],
    queryFn: async () => {
      const res = await fetch(`/api/mnav?interval=${interval}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Failed to fetch mNAV (${res.status})`);
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useMnavHealth() {
  return useQuery<MnavHealth>({
    queryKey: ['mnav', 'health'],
    queryFn: async () => {
      const res = await fetch('/api/mnav/health');
      if (!res.ok) throw new Error(`Failed to fetch health (${res.status})`);
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
