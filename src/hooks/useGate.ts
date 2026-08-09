'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { emptyGate, type GateState, type SectorArm } from '@/types/accumulation';
import { readApiError } from '@/lib/fetchError';

const GATE_KEY = ['accumulation', 'gate'] as const;

async function fetchGate(): Promise<GateState> {
  const res = await fetch('/api/accumulation/gate');
  if (!res.ok) {
    // Redis not configured (local dev without Upstash) → fall back to a closed
    // gate rather than erroring the whole view.
    if (res.status === 500) return emptyGate();
    throw await readApiError(res, '闸门状态');
  }
  const json = (await res.json()) as { ok: boolean; gate?: GateState };
  return json.gate ?? emptyGate();
}

type GatePatch = { open: boolean } | { sector: string; arm: SectorArm };

export function useGate() {
  const queryClient = useQueryClient();

  const query = useQuery<GateState>({
    queryKey: GATE_KEY,
    queryFn: fetchGate,
    staleTime: 30_000,
    // Gate changes are rare, so a short request while this page is visible is
    // much cheaper than keeping a Vercel Function alive with SSE.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });

  const mutation = useMutation({
    mutationFn: async (patch: GatePatch): Promise<GateState> => {
      const res = await fetch('/api/accumulation/gate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const errorResponse = res.clone();
      const json = (await res.json()) as { ok: boolean; gate?: GateState };
      if (!res.ok || !json.gate) {
        throw await readApiError(errorResponse, '闸门更新失败');
      }
      return json.gate;
    },
    onSuccess: (gate) => queryClient.setQueryData(GATE_KEY, gate),
  });

  return {
    gate: query.data ?? emptyGate(),
    isLoading: query.isLoading,
    setOpen: (open: boolean) => mutation.mutate({ open }),
    setSectorArm: (sector: string, arm: SectorArm) =>
      mutation.mutate({ sector, arm }),
    isMutating: mutation.isPending,
  };
}
