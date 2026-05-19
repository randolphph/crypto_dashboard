import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DashboardState {
  refreshInterval: number;
  setRefreshInterval: (interval: number) => void;
  // Timestamp (ms since epoch) of the last refresh. Stored as a number so
  // the UI can render it as relative time ("2 分钟前") and disambiguate
  // across midnight rollovers, instead of the stale "14:23" string format.
  lastRefreshed: number | null;
  setLastRefreshed: (timestamp: number) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      refreshInterval: 60,
      setRefreshInterval: (interval) => set({ refreshInterval: interval }),
      lastRefreshed: null,
      setLastRefreshed: (timestamp) => set({ lastRefreshed: timestamp }),
    }),
    {
      name: 'crypto-dashboard-settings',
      partialize: (state) => ({
        refreshInterval: state.refreshInterval,
      }),
    }
  )
);
