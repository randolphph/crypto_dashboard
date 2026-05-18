import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StockPosition } from '@/types/stocks';

interface State {
  positions: StockPosition[];
  addPosition: (p: StockPosition) => void;
  removePosition: (id: string) => void;
  updatePosition: (id: string, updates: Partial<Omit<StockPosition, 'id'>>) => void;
}

export const useStockPositionStore = create<State>()(
  persist(
    (set) => ({
      positions: [],
      addPosition: (p) =>
        set((s) => ({ positions: [...s.positions, p] })),
      removePosition: (id) =>
        set((s) => ({ positions: s.positions.filter((p) => p.id !== id) })),
      updatePosition: (id, updates) =>
        set((s) => ({
          positions: s.positions.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),
    }),
    { name: 'crypto-dashboard-stock-positions' }
  )
);
