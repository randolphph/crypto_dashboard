import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StrategyTable {
  id: string;
  // "记号" supplied by the AI when pushing via POST /api/strategy. When
  // present, the table is identified by this key — same key from the server
  // overwrites the local copy. Absent on locally-imported (paste/file) tables.
  key?: string;
  headers: string[];
  rows: string[][];
  raw: string;
  importedAt: number;
  note?: string;
}

interface StrategyStoreState {
  tables: StrategyTable[];
  // IDs we've already received from the server (via SSE/REST). When the
  // server re-broadcasts the full list on reconnect we use this to avoid
  // resurrecting tables the user has locally deleted.
  seenServerIds: string[];
  addTable: (table: Omit<StrategyTable, 'id'>) => void;
  removeTable: (id: string) => void;
  clearAll: () => void;
  updateCell: (id: string, row: number, col: number, value: string) => void;
  updateHeader: (id: string, col: number, value: string) => void;
  removeRow: (id: string, row: number) => void;
  updateNote: (id: string, note: string) => void;
  ingestServerTables: (server: StrategyTable[]) => void;
}

const SEEN_IDS_CAP = 500;

function makeId(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

// v1 → v2: store used to hold a single `table`; promote it into a one-element
// `tables` array so existing imports survive the upgrade.
interface LegacyV1State {
  table?: Omit<StrategyTable, 'id'> | null;
}

export const useStrategyStore = create<StrategyStoreState>()(
  persist(
    (set) => ({
      tables: [],
      seenServerIds: [],
      addTable: (table) =>
        set((s) => ({
          tables: [{ ...table, id: makeId() }, ...s.tables],
        })),
      removeTable: (id) =>
        set((s) => ({ tables: s.tables.filter((t) => t.id !== id) })),
      clearAll: () => set({ tables: [] }),
      updateCell: (id, row, col, value) =>
        set((s) => ({
          tables: s.tables.map((t) => {
            if (t.id !== id) return t;
            const rows = t.rows.map((r, ri) => {
              if (ri !== row) return r;
              const next = [...r];
              next[col] = value;
              return next;
            });
            return { ...t, rows };
          }),
        })),
      updateHeader: (id, col, value) =>
        set((s) => ({
          tables: s.tables.map((t) => {
            if (t.id !== id) return t;
            const headers = [...t.headers];
            headers[col] = value;
            return { ...t, headers };
          }),
        })),
      removeRow: (id, row) =>
        set((s) => ({
          tables: s.tables.map((t) =>
            t.id === id
              ? { ...t, rows: t.rows.filter((_, ri) => ri !== row) }
              : t
          ),
        })),
      updateNote: (id, note) =>
        set((s) => ({
          tables: s.tables.map((t) =>
            t.id === id ? { ...t, note: note.trim() || undefined } : t
          ),
        })),
      ingestServerTables: (server) =>
        set((s) => {
          // Two paths:
          //   - keyed tables (the new AI-push flow): identity is `key`.
          //     Replace any local table with the same key; if importedAt
          //     unchanged, no-op so we don't churn the UI on every reconnect.
          //     Refreshed tables bubble to the top.
          //   - unkeyed tables (legacy / unusual): dedupe by id via
          //     seenServerIds so locally-deleted ones don't resurrect.
          const seen = new Set(s.seenServerIds);
          let next = s.tables;
          let mutated = false;

          // Walk oldest-first so the newest table ends up at index 0 after
          // successive prepends.
          for (let i = server.length - 1; i >= 0; i--) {
            const incoming = server[i];
            if (incoming.key) {
              const idx = next.findIndex((t) => t.key === incoming.key);
              if (idx >= 0) {
                const existing = next[idx];
                if (existing.importedAt === incoming.importedAt) continue;
                // Replace + move to top.
                next = [
                  incoming,
                  ...next.slice(0, idx),
                  ...next.slice(idx + 1),
                ];
                mutated = true;
              } else {
                next = [incoming, ...next];
                mutated = true;
              }
            } else {
              if (seen.has(incoming.id)) continue;
              seen.add(incoming.id);
              next = [incoming, ...next];
              mutated = true;
            }
          }

          const seenIds = Array.from(seen);
          const cappedSeen =
            seenIds.length > SEEN_IDS_CAP
              ? seenIds.slice(-SEEN_IDS_CAP)
              : seenIds;

          if (!mutated && cappedSeen.length === s.seenServerIds.length) {
            return s;
          }
          return { ...s, tables: next, seenServerIds: cappedSeen };
        }),
    }),
    {
      name: 'crypto-dashboard-ai-strategy',
      version: 3,
      migrate: (persisted, version) => {
        // The persisted slice only carries data fields; actions are supplied
        // by the create() body and merged back in by zustand. We cast via
        // `unknown` so TS doesn't ask us to fabricate the action methods.
        if (version < 2 && persisted && typeof persisted === 'object') {
          const legacy = persisted as LegacyV1State;
          const old = legacy.table;
          return {
            tables: old ? [{ ...old, id: makeId() }] : [],
            seenServerIds: [],
          } as unknown as StrategyStoreState;
        }
        if (version < 3 && persisted && typeof persisted === 'object') {
          const prev = persisted as Partial<StrategyStoreState>;
          return {
            ...prev,
            tables: prev.tables ?? [],
            seenServerIds: [],
          } as unknown as StrategyStoreState;
        }
        return persisted as StrategyStoreState;
      },
    }
  )
);
