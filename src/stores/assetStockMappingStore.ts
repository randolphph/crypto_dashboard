import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizeStockSymbol, type AssetStockMapping } from '@/lib/portfolio/assetStockMapping';

interface AssetStockMappingState {
  mappings: AssetStockMapping[];
  setMapping: (key: string, symbol: string) => void;
  removeMapping: (key: string) => void;
}

export const useAssetStockMappingStore = create<AssetStockMappingState>()(
  persist((set) => ({
    mappings: [],
    setMapping: (key, value) => {
      const symbol = normalizeStockSymbol(value);
      set((state) => ({ mappings: [...state.mappings.filter((entry) => entry.key !== key), { key, symbol }] }));
    },
    removeMapping: (key) => set((state) => ({ mappings: state.mappings.filter((entry) => entry.key !== key) })),
  }), { name: 'crypto-dashboard-asset-stock-mappings', version: 1 })
);
