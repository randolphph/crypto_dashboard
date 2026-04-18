import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CustomAsset {
  id: string;
  name: string;
  value: number;
}

interface CustomAssetStoreState {
  assets: CustomAsset[];
  addAsset: (asset: CustomAsset) => void;
  removeAsset: (id: string) => void;
  updateAsset: (id: string, updates: Partial<Omit<CustomAsset, 'id'>>) => void;
}

export const useCustomAssetStore = create<CustomAssetStoreState>()(
  persist(
    (set) => ({
      assets: [],
      addAsset: (asset) =>
        set((state) => ({ assets: [...state.assets, asset] })),
      removeAsset: (id) =>
        set((state) => ({ assets: state.assets.filter((a) => a.id !== id) })),
      updateAsset: (id, updates) =>
        set((state) => ({
          assets: state.assets.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        })),
    }),
    { name: 'crypto-dashboard-custom-assets' }
  )
);
