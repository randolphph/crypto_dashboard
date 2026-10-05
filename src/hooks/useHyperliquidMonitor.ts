'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHyperliquidSnapshot } from '@/lib/hyperliquid/client';
import { diffHyperliquidSnapshots } from '@/lib/hyperliquid/events';
import type {
  HyperliquidMonitorEvent,
  HyperliquidNetwork,
  HyperliquidSnapshot,
} from '@/types/hyperliquid';

type MonitorStatus = 'idle' | 'loading' | 'running' | 'error';

export function useHyperliquidMonitor() {
  const [status, setStatus] = useState<MonitorStatus>('idle');
  const [snapshot, setSnapshot] = useState<HyperliquidSnapshot | null>(null);
  const [events, setEvents] = useState<HyperliquidMonitorEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRef = useRef<HyperliquidSnapshot | null>(null);
  const runIdRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const query = useCallback(async (
    address: string,
    network: HyperliquidNetwork,
    runId: number,
  ) => {
    if (document.hidden || runId !== runIdRef.current) return null;
    try {
      const next = await fetchHyperliquidSnapshot(address, network);
      if (runId !== runIdRef.current) return null;
      const previous = snapshotRef.current;
      snapshotRef.current = next;
      setSnapshot(next);
      if (previous && previous.address === next.address && previous.network === next.network) {
        const changes = diffHyperliquidSnapshots(previous, next);
        if (changes.length > 0) {
          setEvents((current) => [...changes, ...current].slice(0, 100));
        }
      }
      setError(null);
      setStatus('running');
      return next;
    } catch (queryError) {
      if (runId !== runIdRef.current) return null;
      setError(queryError instanceof Error ? queryError.message : 'Hyperliquid 查询失败');
      setStatus('error');
      return null;
    }
  }, []);

  const start = useCallback(async (
    address: string,
    network: HyperliquidNetwork,
    intervalSeconds: number,
  ) => {
    clearTimer();
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    snapshotRef.current = null;
    setSnapshot(null);
    setEvents([]);
    setError(null);
    setStatus('loading');
    const firstSnapshot = await query(address, network, runId);
    if (runId !== runIdRef.current) return null;
    intervalRef.current = setInterval(() => {
      void query(address, network, runId);
    }, intervalSeconds * 1_000);
    return firstSnapshot;
  }, [clearTimer, query]);

  const refresh = useCallback(async () => {
    const current = snapshotRef.current;
    if (!current) return;
    setStatus('loading');
    await query(current.address, current.network, runIdRef.current);
  }, [query]);

  const stop = useCallback(() => {
    clearTimer();
    runIdRef.current += 1;
    setStatus('idle');
  }, [clearTimer]);

  useEffect(() => () => {
    clearTimer();
    runIdRef.current += 1;
  }, [clearTimer]);

  return { status, snapshot, events, error, start, refresh, stop };
}
