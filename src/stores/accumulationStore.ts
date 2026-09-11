import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_AI_TARGET_PORTFOLIO_SHARE,
  type AccumulationTarget,
} from '@/types/accumulation';

interface State {
  targets: AccumulationTarget[];
  targetPortfolioShare: number;
  setTargetPortfolioShare: (share: number) => void;
  addTarget: (t: Omit<AccumulationTarget, 'id'>) => void;
  removeTarget: (id: string) => void;
  updateTarget: (
    id: string,
    updates: Partial<Omit<AccumulationTarget, 'id'>>
  ) => void;
  replaceAll: (targets: AccumulationTarget[]) => void;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// The加仓计划 is hand-maintained locally (per the chosen design). Mirrors
// stockPositionStore: a persisted target list plus the AI portfolio-share
// setting used to scale the whole plan. Targets support add/remove/update and
// bulk replace for paste/import-a-whole-plan-JSON workflows.
export const useAccumulationStore = create<State>()(
  persist(
    (set) => ({
      targets: [],
      targetPortfolioShare: DEFAULT_AI_TARGET_PORTFOLIO_SHARE,
      setTargetPortfolioShare: (share) =>
        set({
          targetPortfolioShare: Number.isFinite(share)
            ? Math.min(1, Math.max(0, share))
            : DEFAULT_AI_TARGET_PORTFOLIO_SHARE,
        }),
      addTarget: (t) =>
        set((s) => ({ targets: [...s.targets, { ...t, id: makeId() }] })),
      removeTarget: (id) =>
        set((s) => ({ targets: s.targets.filter((t) => t.id !== id) })),
      updateTarget: (id, updates) =>
        set((s) => ({
          targets: s.targets.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),
      replaceAll: (targets) =>
        set({
          targets: targets.map((t) => ({ ...t, id: t.id || makeId() })),
        }),
    }),
    {
      name: 'crypto-dashboard-accumulation-plan',
      version: 1,
      migrate: (state) => state as State,
    }
  )
);
