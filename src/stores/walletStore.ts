import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WalletConfig, TrackedToken } from '@/types/onchain';

interface WalletStoreState {
  wallets: WalletConfig[];
  addWallet: (wallet: WalletConfig) => void;
  removeWallet: (id: string) => void;
  updateWallet: (id: string, updates: Partial<WalletConfig>) => void;
  addToken: (walletId: string, token: TrackedToken) => void;
  removeToken: (walletId: string, contractAddress: string) => void;
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
      addToken: (walletId, token) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === walletId
              ? { ...w, trackedTokens: [...w.trackedTokens, token] }
              : w
          ),
        })),
      removeToken: (walletId, contractAddress) =>
        set((state) => ({
          wallets: state.wallets.map((w) =>
            w.id === walletId
              ? {
                  ...w,
                  trackedTokens: w.trackedTokens.filter(
                    (t) => t.contractAddress !== contractAddress
                  ),
                }
              : w
          ),
        })),
    }),
    {
      name: 'crypto-dashboard-wallets',
    }
  )
);
