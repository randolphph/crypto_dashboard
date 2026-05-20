import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ReceiptTokenEntry {
  chainId: string;
  tokenAddress: string;
  label?: string;
}

interface ReceiptTokenStoreState {
  entries: ReceiptTokenEntry[];
  addEntry: (entry: ReceiptTokenEntry) => void;
  removeEntry: (chainId: string, tokenAddress: string) => void;
}

function sameKey(
  a: { chainId: string; tokenAddress: string },
  b: { chainId: string; tokenAddress: string }
): boolean {
  return (
    a.chainId === b.chainId &&
    a.tokenAddress.toLowerCase() === b.tokenAddress.toLowerCase()
  );
}

export const useReceiptTokenStore = create<ReceiptTokenStoreState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: ({ chainId, tokenAddress, label }) =>
        set((state) => {
          const cid = chainId.trim();
          const addr = tokenAddress.trim();
          if (!cid || !addr) return state;
          const key = { chainId: cid, tokenAddress: addr };
          if (state.entries.some((e) => sameKey(e, key))) return state;
          return {
            entries: [
              ...state.entries,
              {
                chainId: cid,
                tokenAddress: addr,
                label: label?.trim() || undefined,
              },
            ],
          };
        }),
      removeEntry: (chainId, tokenAddress) =>
        set((state) => ({
          entries: state.entries.filter(
            (e) => !sameKey(e, { chainId, tokenAddress })
          ),
        })),
    }),
    {
      name: 'crypto-dashboard-receipt-token-addresses',
      version: 1,
      migrate: (state) => state as ReceiptTokenStoreState,
    }
  )
);
