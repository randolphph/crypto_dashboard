'use client';

import { RefreshCw } from 'lucide-react';
import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useDashboardStore } from '@/stores/dashboardStore';

export function RefreshControl() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastRefreshed = useDashboardStore((s) => s.lastRefreshed);
  const setLastRefreshed = useDashboardStore((s) => s.setLastRefreshed);
  const isFetching = useIsFetching();

  useEffect(() => {
    setLastRefreshed(new Date().toLocaleTimeString());
  }, [setLastRefreshed]);

  // Update last refreshed time when background refetch completes
  useEffect(() => {
    if (isFetching === 0) {
      setLastRefreshed(new Date().toLocaleTimeString());
    }
  }, [isFetching, setLastRefreshed]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setLastRefreshed(new Date().toLocaleTimeString());
    setIsRefreshing(false);
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {lastRefreshed && <span>上次刷新: {lastRefreshed}</span>}
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
