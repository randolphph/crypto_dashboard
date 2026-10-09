'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHyperliquidFills, fetchHyperliquidOrderStatus, fetchHyperliquidSnapshot } from '@/lib/hyperliquid/client';
import { diffHyperliquidSnapshots } from '@/lib/hyperliquid/events';
import type {
  HyperliquidMonitorEvent,
  HyperliquidNetwork,
  HyperliquidOrder,
  HyperliquidSnapshot,
} from '@/types/hyperliquid';

type MonitorStatus = 'idle' | 'loading' | 'running' | 'error';

export function useHyperliquidMonitor() {
  const [status, setStatus] = useState<MonitorStatus>('idle');
  const [snapshot, setSnapshot] = useState<HyperliquidSnapshot | null>(null);
  const [events, setEvents] = useState<HyperliquidMonitorEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRef = useRef<HyperliquidSnapshot | null>(null);
  const runIdRef = useRef(0);
  const inFlightRunRef = useRef<number | null>(null);
  const fillsSinceRef = useRef(0);
  const startedAtRef = useRef(0);
  const seenFillsRef = useRef(new Set<string>());
  const pendingOrdersRef = useRef(new Map<string, HyperliquidOrder>());

  const clearTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const query = useCallback(async (
    address: string,
    network: HyperliquidNetwork,
    runId: number,
  ) => {
    if (document.hidden || runId !== runIdRef.current || inFlightRunRef.current === runId) return null;
    inFlightRunRef.current = runId;
    try {
      const previous = snapshotRef.current;
      const [next, fillsResult] = await Promise.all([
        fetchHyperliquidSnapshot(address, network),
        previous ? fetchHyperliquidFills(address, network, Math.max(startedAtRef.current, fillsSinceRef.current - 30_000))
          .then((fills) => ({ fills, error: null }))
          .catch((cause: unknown) => ({ fills: [], error: cause instanceof Error ? cause.message : '成交记录读取失败' }))
          : Promise.resolve({ fills: [], error: null }),
      ]);
      if (runId !== runIdRef.current) return null;
      if (previous && previous.address === next.address && previous.network === next.network) {
        const openOids = new Set(next.orders.map((order) => order.oid));
        const pendingOrders = new Map(pendingOrdersRef.current);
        for (const order of previous.orders) {
          if (!openOids.has(order.oid)) pendingOrders.set(order.oid, order);
        }
        const statuses = await Promise.allSettled([...pendingOrders.keys()].map(async (oid) => (
          [oid, await fetchHyperliquidOrderStatus(address, network, oid)] as const
        )));
        if (runId !== runIdRef.current) return null;
        const resolved = new Map<string, string>();
        for (const result of statuses) {
          if (result.status === 'fulfilled' && result.value[1]) {
            resolved.set(result.value[0], result.value[1]);
          }
        }
        const fills = fillsResult.fills.filter((fill) => !seenFillsRef.current.has(fill.id));
        const changes = diffHyperliquidSnapshots({
          ...previous,
          orders: [...new Map([...previous.orders, ...pendingOrders.values()].map((order) => [order.oid, order])).values()],
        }, next, fills, resolved).map((change) => change.after === null && !change.fill && change.sourceOid
          ? { ...change, id: `ended-${change.sourceOid}-${change.kind}` } : change);
        fills.forEach((fill) => seenFillsRef.current.add(fill.id));
        if (seenFillsRef.current.size > 20_000) seenFillsRef.current = new Set([...seenFillsRef.current].slice(-10_000));
        for (const [oid] of pendingOrders) {
          const status = resolved.get(oid)?.toLowerCase();
          if (openOids.has(oid) || status === 'filled' || status?.endsWith('canceled') || status?.endsWith('rejected')) pendingOrders.delete(oid);
        }
        pendingOrdersRef.current = pendingOrders;
        if (!fillsResult.error) fillsSinceRef.current = next.fetchedAt;
        setActivityError(fillsResult.error ?? (pendingOrders.size > 0 ? '部分订单结束状态待确认，将在下次刷新时重试' : null));
        if (changes.length > 0) {
          setEvents((current) => {
            const confirmedOids = new Set(changes.filter((change) => change.kind === 'order_filled' || change.kind === 'order_canceled' || change.kind === 'order_rejected').map((change) => change.sourceOid));
            const retained = current.filter((change) => change.kind !== 'order_disappeared' || !confirmedOids.has(change.sourceOid));
            return [...new Map([...changes, ...retained].map((change) => [change.id, change])).values()]
              .sort((a, b) => b.observedAt - a.observedAt).slice(0, 100);
          });
        }
      }
      snapshotRef.current = next;
      setSnapshot(next);
      setError(null);
      setStatus('running');
      return next;
    } catch (queryError) {
      if (runId !== runIdRef.current) return null;
      setError(queryError instanceof Error ? queryError.message : 'Hyperliquid 查询失败');
      setStatus('error');
      return null;
    } finally {
      if (inFlightRunRef.current === runId) inFlightRunRef.current = null;
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
    startedAtRef.current = Date.now();
    fillsSinceRef.current = startedAtRef.current;
    seenFillsRef.current = new Set();
    pendingOrdersRef.current = new Map();
    setSnapshot(null);
    setEvents([]);
    setError(null);
    setActivityError(null);
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
    if (!current || inFlightRunRef.current === runIdRef.current) return;
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

  return { status, snapshot, events, error, activityError, start, refresh, stop };
}
