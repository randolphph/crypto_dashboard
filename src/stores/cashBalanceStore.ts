import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CashBalance } from '@/types/stocks';

interface State {
  balances: CashBalance[];
  addBalance: (b: CashBalance) => void;
  removeBalance: (id: string) => void;
  updateBalance: (id: string, updates: Partial<Omit<CashBalance, 'id'>>) => void;
}

export const useCashBalanceStore = create<State>()(
  persist(
    (set) => ({
      balances: [],
      addBalance: (b) =>
        set((s) => ({ balances: [...s.balances, b] })),
      removeBalance: (id) =>
        set((s) => ({ balances: s.balances.filter((b) => b.id !== id) })),
      updateBalance: (id, updates) =>
        set((s) => ({
          balances: s.balances.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        })),
    }),
    {
      name: 'crypto-dashboard-cash-balances',
      version: 1,
      migrate: (state) => state as State,
    }
  )
);
