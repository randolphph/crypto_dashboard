'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSnapshots } from '@/lib/snapshot/store';
import { readAllocationHistory, writeAllocationHistory } from '@/lib/portfolio/allocationHistoryDb';
import { allocationFromSnapshots, ALLOCATION_HOUR_MS, normalizeAllocation, shouldRecordAllocation, type AllocationObservation, type AllocationValue } from '@/lib/portfolio/allocationHistory';
import type { HistoryRecording } from '@/lib/portfolio/history';

interface AllocationHistoryData { points: AllocationObservation[]; writeError?: string }
const historyKey = (wallet: string) => ['allocation-history', wallet.toLowerCase()];
export function useAllocationHistory(wallet: string | null) {
  const owner = wallet?.toLowerCase() ?? '';
  return useQuery<AllocationHistoryData>({
    queryKey: historyKey(owner), enabled: !!owner, staleTime: Infinity, refetchOnWindowFocus: false, retry: false,
    queryFn: async () => {
      const [stored, detailed] = await Promise.all([readAllocationHistory(owner), getSnapshots(owner).catch(() => [])]);
      const timestamps = new Set(stored.map(point => point.timestamp));
      const recovered = allocationFromSnapshots(owner, detailed).filter(point => !timestamps.has(point.timestamp));
      return { points: recovered.length ? await writeAllocationHistory(owner, recovered) : stored };
    },
  });
}

/** Observe already-fetched valuations. Recording never initiates market/RPC requests. */
export function useRecordAllocationHistory({ wallet, categories, status, sourceVersion }: {
  wallet: string | null; categories: AllocationValue[]; status: HistoryRecording['status']; sourceVersion: number;
}) {
  const owner = wallet?.toLowerCase() ?? '', history = useAllocationHistory(wallet), client = useQueryClient();
  const lastQueued = useRef('');
  const [hour, setHour] = useState(() => Math.floor(Date.now() / ALLOCATION_HOUR_MS));
  useEffect(() => {
    if (!owner) return;
    const timer = setInterval(() => setHour(Math.floor(Date.now() / ALLOCATION_HOUR_MS)), 60000);
    return () => clearInterval(timer);
  }, [owner]);
  const signature = JSON.stringify(normalizeAllocation(categories));
  useEffect(() => {
    if (!owner || !history.data || status === 'loading') return;
    const now = Date.now(), allocation = JSON.parse(signature) as AllocationValue[] | null;
    if (status !== 'blocked' && !allocation) return;
    const point: AllocationObservation = status === 'blocked' ? { timestamp: now, paused: true } : {
      timestamp: now, allocation: allocation!, ...(status === 'estimated' ? { quality: 'estimated' as const } : {}),
    };
    if (!shouldRecordAllocation(history.data.points.at(-1), point)) return;
    const request = JSON.stringify([owner, status, signature, sourceVersion, Math.floor(now / ALLOCATION_HOUR_MS)]);
    if (lastQueued.current === request) return;
    lastQueued.current = request;
    void writeAllocationHistory(owner, [point]).then(points => client.setQueryData<AllocationHistoryData>(historyKey(owner), { points }))
      .catch(() => client.setQueryData<AllocationHistoryData>(historyKey(owner), current => current ? { ...current, writeError: '分布记录暂停：本地历史暂时无法保存' } : current));
  }, [owner, history.data, status, signature, sourceVersion, client, hour]);
}
