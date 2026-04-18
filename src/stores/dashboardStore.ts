import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DashboardState {
  refreshInterval: number;
  setRefreshInterval: (interval: number) => void;
  lastRefreshed: string | null;
  setLastRefreshed: (time: string) => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      refreshInterval: 60,
      setRefreshInterval: (interval) => set({ refreshInterval: interval }),
      lastRefreshed: null,
      setLastRefreshed: (time) => set({ lastRefreshed: time }),
    }),
    {
      name: 'crypto-dashboard-settings',
    }
  )
);
