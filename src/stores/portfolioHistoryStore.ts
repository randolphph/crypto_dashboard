import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PortfolioSnapshot {
  timestamp: number; // ms since epoch
  value: number;     // total USD value
}

interface PortfolioHistoryState {
  snapshots: PortfolioSnapshot[];
  addSnapshot: (value: number) => void;
  removeSnapshot: (timestamp: number) => void;
}

// Keep at most 30 days of data (one snapshot per data refresh)
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const usePortfolioHistoryStore = create<PortfolioHistoryState>()(
  persist(
    (set) => ({
      snapshots: [],
      addSnapshot: (value) =>
        set((state) => {
          const now = Date.now();
          const cutoff = now - MAX_AGE_MS;
          const filtered = state.snapshots.filter((s) => s.timestamp > cutoff);
          return { snapshots: [...filtered, { timestamp: now, value }] };
        }),
      removeSnapshot: (timestamp) =>
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.timestamp !== timestamp),
        })),
    }),
    { name: 'crypto-dashboard-portfolio-history' }
  )
);
