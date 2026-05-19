import { create } from 'zustand';
import type { StockBroker, StockCurrency } from '@/types/stocks';

export interface CashToast {
  id: string;
  broker: StockBroker;
  currency: StockCurrency;
  delta: number;
  reason?: string;
}

interface State {
  toasts: CashToast[];
  push: (t: Omit<CashToast, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useCashToastStore = create<State>((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { ...t, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      ],
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
