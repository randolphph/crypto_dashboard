'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { emptyGate, type GateState, type SectorArm } from '@/types/accumulation';

const GATE_KEY = ['accumulation', 'gate'] as const;

async function fetchGate(): Promise<GateState> {
  const res = await fetch('/api/accumulation/gate');
  if (!res.ok) {
    // Redis not configured (local dev without Upstash) → fall back to a closed
    // gate rather than erroring the whole view.
    return emptyGate();
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
    staleTime: Infinity, // SSE keeps it fresh; no polling needed.
  });

  // Live channel: a flip on another device pushes here within ~2s. We write the
  // pushed gate straight into the cache so the toggle reflects instantly.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const es = new EventSource('/api/accumulation/gate/stream');
    const handle = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { gate?: GateState };
        if (data.gate) queryClient.setQueryData(GATE_KEY, data.gate);
      } catch {
        // ignore malformed frames
      }
    };
    es.addEventListener('snapshot', handle);
    es.addEventListener('gate', handle);
    return () => es.close();
  }, [queryClient]);

  const mutation = useMutation({
    mutationFn: async (patch: GatePatch): Promise<GateState> => {
      const res = await fetch('/api/accumulation/gate', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { ok: boolean; gate?: GateState };
      if (!res.ok || !json.gate) {
        throw new Error('闸门更新失败（Redis 未配置？）');
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
