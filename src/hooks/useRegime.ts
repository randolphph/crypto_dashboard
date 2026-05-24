import { useQuery } from '@tanstack/react-query';

export type RegimeLabel =
  | 'bear-bottom'
  | 'accumulation'
  | 'bull-run'
  | 'euphoria';

export interface RegimeData {
  ts: number;
  regime: RegimeLabel;
  mayer: number;
  fearGreed: number;
  fearGreedLabel: string;
  btcDominance: number;
  btcPrice: number;
  btc200dMa: number;
  cached?: boolean;
  errors?: string[];
}

export function useRegime() {
  return useQuery<RegimeData>({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/regime');
      if (!res.ok) throw new Error('regime fetch failed');
      return res.json();
    },
    staleTime: 60 * 60 * 1000,      // 1h client side mirrors backend cache
    refetchInterval: 60 * 60 * 1000,
    refetchOnMount: false,
  });
}
