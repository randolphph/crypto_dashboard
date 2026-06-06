import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SnapshotPayload } from '@/types/snapshot';

interface DashboardState {
  refreshInterval: number;
  setRefreshInterval: (interval: number) => void;
  // Timestamp (ms since epoch) of the last refresh. Stored as a number so
  // the UI can render it as relative time ("2 分钟前") and disambiguate
  // across midnight rollovers, instead of the stale "14:23" string format.
  lastRefreshed: number | null;
  setLastRefreshed: (timestamp: number) => void;
  // Latest fully-built snapshot payload published by Dashboard. Not persisted
  // — it's derived from live API data and gets re-published each refresh.
  // Lets the settings panel's "manual snapshot" button reach a fresh payload
  // even though it lives on a different route from Dashboard.
  latestSnapshotPayload: SnapshotPayload | null;
  setLatestSnapshotPayload: (p: SnapshotPayload | null) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      refreshInterval: 60,
      setRefreshInterval: (interval) => set({ refreshInterval: interval }),
      lastRefreshed: null,
      setLastRefreshed: (timestamp) => set({ lastRefreshed: timestamp }),
      latestSnapshotPayload: null,
      setLatestSnapshotPayload: (p) => set({ latestSnapshotPayload: p }),
    }),
    {
      name: 'crypto-dashboard-settings',
      version: 1,
      migrate: (state) => state as DashboardState,
      partialize: (state) => ({
        refreshInterval: state.refreshInterval,
      }),
    }
  )
);
