import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyTradingReview } from '@/types/review';

type ReviewInput = Omit<DailyTradingReview, 'createdAt' | 'updatedAt'>;

interface DailyReviewState {
  reviews: DailyTradingReview[];
  upsertReview: (review: ReviewInput) => void;
  removeReview: (date: string) => void;
}

export const useDailyReviewStore = create<DailyReviewState>()(
  persist(
    (set) => ({
      reviews: [],
      upsertReview: (review) =>
        set((state) => {
          const now = Date.now();
          const existing = state.reviews.find((item) => item.date === review.date);
          const next: DailyTradingReview = {
            ...review,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          };
          return {
            reviews: [
              next,
              ...state.reviews.filter((item) => item.date !== review.date),
            ].sort((a, b) => b.date.localeCompare(a.date)),
          };
        }),
      removeReview: (date) =>
        set((state) => ({
          reviews: state.reviews.filter((review) => review.date !== date),
        })),
    }),
    {
      name: 'crypto-dashboard-daily-trading-reviews',
      version: 1,
      migrate: (state) => state as DailyReviewState,
    }
  )
);

