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
  importSnapshots: (incoming: PortfolioSnapshot[]) => void;
}

// Retain up to 3 years total. Inside the last 30 days every refresh is kept
// (multiple points per day) so short-term trends stay crisp; older history is
// compacted to one point per local-day closest to noon, which keeps the store
// well under localStorage's 5MB ceiling.
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 3 * 365 * 24 * 60 * 60 * 1000;

function localDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function localNoonTs(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
}

function compactSnapshots(
  snapshots: PortfolioSnapshot[],
  now: number
): PortfolioSnapshot[] {
  const cutoffMax = now - MAX_AGE_MS;
  const cutoffRecent = now - RECENT_WINDOW_MS;

  const recent: PortfolioSnapshot[] = [];
  const byDay = new Map<string, PortfolioSnapshot>();

  for (const s of snapshots) {
    if (s.timestamp <= cutoffMax) continue;
    if (s.timestamp > cutoffRecent) {
      recent.push(s);
      continue;
    }
    const key = localDayKey(s.timestamp);
    const noon = localNoonTs(s.timestamp);
    const existing = byDay.get(key);
    if (
      !existing ||
      Math.abs(s.timestamp - noon) < Math.abs(existing.timestamp - noon)
    ) {
      byDay.set(key, s);
    }
  }

  return [...byDay.values(), ...recent].sort((a, b) => a.timestamp - b.timestamp);
}

export const usePortfolioHistoryStore = create<PortfolioHistoryState>()(
  persist(
    (set) => ({
      snapshots: [],
      addSnapshot: (value) =>
        set((state) => {
          const now = Date.now();
          const next = [...state.snapshots, { timestamp: now, value }];
          return { snapshots: compactSnapshots(next, now) };
        }),
      removeSnapshot: (timestamp) =>
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.timestamp !== timestamp),
        })),
      importSnapshots: (incoming) =>
        set((state) => {
          const map = new Map(state.snapshots.map((s) => [s.timestamp, s]));
          for (const s of incoming) {
            map.set(s.timestamp, s);
          }
          return {
            snapshots: compactSnapshots(Array.from(map.values()), Date.now()),
          };
        }),
    }),
    {
      name: 'crypto-dashboard-portfolio-history',
      version: 2,
      migrate: (state) => {
        // v1 → v2: same shape, just re-run compaction so any stale rows that
        // pre-dated the new 30-day boundary get reduced to one-per-day.
        const s = state as PortfolioHistoryState;
        if (!s?.snapshots) return s;
        return { ...s, snapshots: compactSnapshots(s.snapshots, Date.now()) };
      },
    }
  )
);
