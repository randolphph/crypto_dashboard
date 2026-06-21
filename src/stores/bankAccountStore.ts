import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StockCurrency } from '@/types/stocks';

// Bank cash held outside any broker — checking accounts, savings, e-wallets.
// Lives in the dashboard's 现金 category, separate from broker float so the
// user can see "money I can move" vs "money parked at the broker."

export interface BankAccount {
  id: string;
  bank: string;          // free-form: "招商银行", "汇丰", "支付宝", …
  currency: StockCurrency;
  amount: number;
  note?: string;
}

interface State {
  accounts: BankAccount[];
  addAccount: (a: BankAccount) => void;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, updates: Partial<Omit<BankAccount, 'id'>>) => void;
}

export const useBankAccountStore = create<State>()(
  persist(
    (set) => ({
      accounts: [],
      addAccount: (a) => set((s) => ({ accounts: [...s.accounts, a] })),
      removeAccount: (id) =>
        set((s) => ({ accounts: s.accounts.filter((b) => b.id !== id) })),
      updateAccount: (id, updates) =>
        set((s) => ({
          accounts: s.accounts.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        })),
    }),
    {
      name: 'crypto-dashboard-bank-accounts',
      version: 1,
      migrate: (state) => state as State,
    }
  )
);
