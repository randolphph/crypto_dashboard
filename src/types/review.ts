export type TradingEmotion =
  | 'fearful'
  | 'anxious'
  | 'calm'
  | 'focused'
  | 'excited'
  | 'greedy';

export interface DailyTradingReview {
  date: string; // local YYYY-MM-DD
  emotion: TradingEmotion;
  intensity: number; // 1-5
  logic: string;
  emotionNote: string;
  reflection: string;
  createdAt: number;
  updatedAt: number;
}

export const TRADING_EMOTION_LABEL: Record<TradingEmotion, string> = {
  fearful: '恐惧',
  anxious: '焦虑',
  calm: '平静',
  focused: '专注',
  excited: '兴奋',
  greedy: '贪婪',
};

