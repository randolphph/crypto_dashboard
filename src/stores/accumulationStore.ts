import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { assertPositionBudget } from '@/lib/accumulation/positionLimit';
import {
  DEFAULT_AI_TARGET_PORTFOLIO_SHARE,
  type AccumulationTarget,
} from '@/types/accumulation';

interface State {
  targets: AccumulationTarget[];
  targetPortfolioShare: number;
  setTargetPortfolioShare: (share: number) => void;
  setAllocationPlan: (share: number, limits: Record<string, number | undefined>) => void;
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
// stockPositionStore: a persisted target list plus the overall portfolio
// target used to scale the whole plan. Targets support
// add/remove/update and bulk replace for paste/import-a-whole-plan-JSON
// workflows.
export const useAccumulationStore = create<State>()(
  persist(
    (set) => ({
      targets: [],
      targetPortfolioShare: DEFAULT_AI_TARGET_PORTFOLIO_SHARE,
      setTargetPortfolioShare: (share) => set(state => {
        assertPositionBudget(state.targets, share);
        return { targetPortfolioShare: share };
      }),
      setAllocationPlan: (share, limits) => set(state => {
        // Apply only allocation fields to the latest targets, preserving other
        // edits and including any newly added target in the final validation.
        const targets = state.targets.map(target => Object.hasOwn(limits, target.id)
          ? { ...target, positionLimitShare: limits[target.id] }
          : target);
        assertPositionBudget(targets, share);
        return { targets, targetPortfolioShare: share };
      }),
      addTarget: (t) => {
        set(state => {
          const targets = [...state.targets, { ...t, id: makeId() }];
          assertPositionBudget(targets, state.targetPortfolioShare, state.targets);
          return { targets };
        });
      },
      removeTarget: (id) =>
        set((s) => ({ targets: s.targets.filter((t) => t.id !== id) })),
      updateTarget: (id, updates) => {
        set(state => {
          const targets = state.targets.map(t => t.id === id ? { ...t, ...updates } : t);
          assertPositionBudget(targets, state.targetPortfolioShare, state.targets);
          return { targets };
        });
      },
      replaceAll: (targets) => {
        set(state => {
          assertPositionBudget(targets, state.targetPortfolioShare);
          return { targets: targets.map(t => ({ ...t, id: t.id || makeId() })) };
        });
      },
    }),
    {
      name: 'crypto-dashboard-accumulation-plan',
      version: 2,
      migrate: (persistedState) => {
        const previous = persistedState as Partial<State>;
        return {
          targets: Array.isArray(previous.targets) ? previous.targets : [],
          targetPortfolioShare:
            typeof previous.targetPortfolioShare === 'number'
              ? previous.targetPortfolioShare
              : DEFAULT_AI_TARGET_PORTFOLIO_SHARE,
        } as State;
      },
    }
  )
);
