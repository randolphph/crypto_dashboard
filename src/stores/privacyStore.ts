import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrivacyState {
  hidden: boolean;
  toggle: () => void;
  setHidden: (hidden: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      hidden: false,
      toggle: () => set((s) => ({ hidden: !s.hidden })),
      setHidden: (hidden) => set({ hidden }),
    }),
    {
      name: 'crypto-dashboard-privacy',
    }
  )
);
