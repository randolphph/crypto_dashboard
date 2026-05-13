import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CashFlowType = 'deposit' | 'withdraw';

export interface CashFlowEvent {
  id: string;
  timestamp: number; // ms since epoch
  type: CashFlowType;
  amount: number; // USD, positive
  note?: string;
}

interface CashFlowState {
  events: CashFlowEvent[];
  addEvent: (event: Omit<CashFlowEvent, 'id'>) => void;
  removeEvent: (id: string) => void;
  importEvents: (incoming: CashFlowEvent[]) => void;
  clearAll: () => void;
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useCashFlowStore = create<CashFlowState>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (event) =>
        set((state) => ({
          events: [...state.events, { ...event, id: genId() }].sort(
            (a, b) => a.timestamp - b.timestamp
          ),
        })),
      removeEvent: (id) =>
        set((state) => ({
          events: state.events.filter((e) => e.id !== id),
        })),
      importEvents: (incoming) =>
        set((state) => {
          const map = new Map(state.events.map((e) => [e.id, e]));
          for (const e of incoming) {
            map.set(e.id, e);
          }
          return {
            events: Array.from(map.values()).sort(
              (a, b) => a.timestamp - b.timestamp
            ),
          };
        }),
      clearAll: () => set({ events: [] }),
    }),
    { name: 'crypto-dashboard-cash-flow' }
  )
);

/**
 * Net flow in [startMs, endMs]. Positive = deposits exceed withdrawals.
 */
export function netFlowInRange(
  events: CashFlowEvent[],
  startMs: number,
  endMs: number
): number {
  let net = 0;
  for (const e of events) {
    if (e.timestamp < startMs || e.timestamp > endMs) continue;
    net += e.type === 'deposit' ? e.amount : -e.amount;
  }
  return net;
}
