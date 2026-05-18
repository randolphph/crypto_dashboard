import { create } from 'zustand';

export type VaultStatus =
  | 'pending'    // bootstrap not finished yet
  | 'unauth'     // bootstrap done, needs wallet login
  | 'unlocking'  // wallet sign in progress
  | 'authed'    // logged in, vault unlocked
  | 'error';

interface State {
  status: VaultStatus;
  address: string | null;
  error: string | null;
  setStatus: (s: VaultStatus) => void;
  setAddress: (a: string | null) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useVaultStore = create<State>((set) => ({
  status: 'pending',
  address: null,
  error: null,
  setStatus: (status) => set({ status }),
  setAddress: (address) => set({ address }),
  setError: (error) => set({ error }),
  reset: () => set({ status: 'unauth', address: null, error: null }),
}));
