import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { validateManualStockCost, type ManualStockCost } from '@/lib/portfolio/manualStockCost';

interface State {
  costs: Record<string, ManualStockCost>;
  setCost: (assetId: string, cost: ManualStockCost) => void;
  removeCost: (assetId: string) => void;
}
export const useManualStockCostStore = create<State>()(persist(set => ({
  costs: {},
  setCost: (assetId, cost) => {
    const checked = validateManualStockCost(cost);
    set(state => ({ costs: { ...state.costs, [assetId]: checked } }));
  },
  removeCost: assetId => set(state => ({ costs: Object.fromEntries(Object.entries(state.costs).filter(([key]) => key !== assetId)) })),
}), { name: 'crypto-dashboard-manual-stock-costs', version: 1 }));
