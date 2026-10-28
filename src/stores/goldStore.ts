import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { validateGoldHolding } from '@/lib/portfolio/gold';
import type { GoldHolding } from '@/types/gold';

interface State {
  holdings: GoldHolding[];
  addHolding: (holding: GoldHolding) => void;
  updateHolding: (id: string, updates: Partial<Omit<GoldHolding, 'id'>>) => void;
  removeHolding: (id: string) => void;
}

export const useGoldStore = create<State>()(persist((set) => ({
  holdings: [],
  addHolding: holding => {
    const checked = validateGoldHolding(holding);
    set(s => ({ holdings: [...s.holdings, checked] }));
  },
  updateHolding: (id, updates) => set(s => ({ holdings: s.holdings.map(h => h.id === id ? validateGoldHolding({ ...h, ...updates }) : h) })),
  removeHolding: id => set(s => ({ holdings: s.holdings.filter(h => h.id !== id) })),
}), { name: 'crypto-dashboard-gold', version: 1 }));
