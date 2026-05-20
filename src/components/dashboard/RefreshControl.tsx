'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useDashboardStore } from '@/stores/dashboardStore';

// Render a relative time like "2 分钟前" / "昨日 14:23". The previous
// implementation stored the formatted clock time string, which made it
// impossible to tell whether "14:23" meant today or yesterday after the
// page sat idle across midnight.
function formatRelative(ts: number, now: number): string {
  const seconds = Math.floor((now - ts) / 1000);
  if (seconds < 5) return '刚刚';
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  // Same calendar day → "N 小时前"; otherwise show the day boundary.
  const refDate = new Date(ts);
  const nowDate = new Date(now);
  const sameDay =
    refDate.getFullYear() === nowDate.getFullYear() &&
    refDate.getMonth() === nowDate.getMonth() &&
    refDate.getDate() === nowDate.getDate();
  if (sameDay) return `${hours} 小时前`;
  const yesterday = new Date(nowDate);
  yesterday.setDate(nowDate.getDate() - 1);
  const isYesterday =
    refDate.getFullYear() === yesterday.getFullYear() &&
    refDate.getMonth() === yesterday.getMonth() &&
    refDate.getDate() === yesterday.getDate();
  const hhmm = refDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (isYesterday) return `昨日 ${hhmm}`;
  return refDate.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ` ${hhmm}`;
}

// Watch React Query's cache for queries whose latest refetch failed but still
// have data from a previous successful fetch — that's the "displaying stale
// cache" case the user should be warned about. Returns the oldest such
// dataUpdatedAt so the warning reflects the most stale source.
//
// Uses useSyncExternalStore so React handles the subscription correctly.
// A plain useEffect + setState would re-enter setState during another
// component's render — useQuery() registers an observer on the cache, which
// synchronously fires our listener, which then setState's into RefreshControl
// while FxBadge (or whoever) is mid-render.
function useStaleCacheInfo() {
  const queryClient = useQueryClient();

  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient]
  );

  // getSnapshot must return a stable value when nothing changed (React uses
  // Object.is), so we return a number | null rather than a fresh object.
  const getSnapshot = useCallback(() => {
    const errored = queryClient
      .getQueryCache()
      .getAll()
      .filter((q) => q.state.status === 'error' && q.state.data !== undefined);
    if (errored.length === 0) return null;
    return Math.min(...errored.map((q) => q.state.dataUpdatedAt));
  }, [queryClient]);

  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function RefreshControl() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastRefreshed = useDashboardStore((s) => s.lastRefreshed);
  const setLastRefreshed = useDashboardStore((s) => s.setLastRefreshed);
  const isFetching = useIsFetching();
  const staleSince = useStaleCacheInfo();

  // Tick state so the relative label stays fresh even while no fetch fires.
  // Updates once a minute — enough granularity for "N 分钟前" without
  // burning re-renders.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLastRefreshed(Date.now());
  }, [setLastRefreshed]);

  // Update last-refreshed timestamp when background refetch completes
  useEffect(() => {
    if (isFetching === 0) {
      setLastRefreshed(Date.now());
      setNow(Date.now());
    }
  }, [isFetching, setLastRefreshed]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setLastRefreshed(Date.now());
    setNow(Date.now());
    setIsRefreshing(false);
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {staleSince !== null && (
        <span
          className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
          title={`最近一次刷新失败，仍显示 ${new Date(staleSince).toLocaleString()} 抓取的数据`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          数据为 {formatRelative(staleSince, now)}缓存
        </span>
      )}
      {lastRefreshed && (
        <span title={new Date(lastRefreshed).toLocaleString()}>
          上次刷新: {formatRelative(lastRefreshed, now)}
        </span>
      )}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="inline-flex items-center justify-center rounded-md p-2 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <RefreshCw
          className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
        />
      </button>
    </div>
  );
}
