import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Liability } from '@/lib/portfolio/liabilities';

interface State {
  liabilities: Liability[];
  addLiability: (row: Liability) => void;
  updateLiability: (id: string, updates: Omit<Liability, 'id'>) => void;
  removeLiability: (id: string) => void;
}

export const useLiabilityStore = create<State>()(persist((set) => ({
  liabilities: [],
  addLiability: (row) => set((s) => ({ liabilities: [...s.liabilities, row] })),
  updateLiability: (id, updates) => set((s) => ({ liabilities: s.liabilities.map((row) => row.id === id ? { id, ...updates } : row) })),
  removeLiability: (id) => set((s) => ({ liabilities: s.liabilities.filter((row) => row.id !== id) })),
}), { name: 'crypto-dashboard-liabilities', version: 1 }));
