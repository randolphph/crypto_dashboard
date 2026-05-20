import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WalletConfig } from '@/types/onchain';

interface WalletStoreState {
  wallets: WalletConfig[];
  addWallet: (wallet: WalletConfig) => void;
  removeWallet: (id: string) => void;
  updateWallet: (id: string, updates: Partial<WalletConfig>) => void;
}

export const useWalletStore = create<WalletStoreState>()(
  persist(
    (set) => ({
      wallets: [],
      addWallet: (wallet) =>
        set((state) => ({ wallets: [...state.wallets, wallet] })),
      removeWallet: (id) =>
        set((state) => ({
          wallets: state.wallets.filter((w) => w.id !== id),
        })),
      updateWallet: (id, updates) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        })),
    }),
    {
      name: 'crypto-dashboard-wallets',
      version: 1,
      migrate: (state) => state as WalletStoreState,
    }
  )
);
