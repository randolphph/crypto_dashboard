import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EconomicAllocationAnalysis } from '@/lib/ai/portfolioAllocation';

interface EconomicAllocationState {
  signature: string;
  analysis: EconomicAllocationAnalysis | null;
  analyzedAt: number | null;
  saveAnalysis: (
    signature: string,
    analysis: EconomicAllocationAnalysis
  ) => void;
}

export const useEconomicAllocationStore = create<EconomicAllocationState>()(
  persist(
    (set) => ({
      signature: '',
      analysis: null,
      analyzedAt: null,
      saveAnalysis: (signature, analysis) =>
        set({ signature, analysis, analyzedAt: Date.now() }),
    }),
    {
      name: 'crypto-dashboard-ai-economic-allocation',
      version: 1,
      partialize: ({ signature, analysis, analyzedAt }) => ({
        signature,
        analysis,
        analyzedAt,
      }),
    }
  )
);
