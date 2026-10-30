import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nextPrivacyMode, privacyFlags, restorePrivacy, type PrivacyMode } from '@/lib/privacy';

interface PrivacyState {
  mode: PrivacyMode;
  hidden: boolean;
  percentHidden: boolean;
  toggle: () => void;
  setHidden: (hidden: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      ...privacyFlags('visible'),
      toggle: () => set((s) => privacyFlags(nextPrivacyMode(s.mode))),
      setHidden: (hidden) => set(privacyFlags(hidden ? 'hidden' : 'visible')),
    }),
    {
      name: 'crypto-dashboard-privacy',
      version: 2,
      partialize: (state) => ({ mode: state.mode }),
      migrate: (state) => restorePrivacy(state),
      merge: (saved, current) => ({ ...current, ...restorePrivacy(saved) }),
    }
  )
);
