import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TradeKind = 'stock' | 'option' | 'crypto';
export type TradeDirection = 'buy' | 'sell';

export interface Trade {
  id: string;
  timestamp: number;        // ms since epoch
  symbol: string;
  kind: TradeKind;
  direction: TradeDirection;
  quantity: number;         // shares / contracts / coins
  price: number;            // per unit, in `currency`
  currency: string;         // 'USD'|'CNY'|'HKD'|'KRW'|'USDT'|'BTC'|...
  // USD notional at the time the trade was recorded. Stored so chart markers
  // don't have to back-fill historical FX/crypto prices later.
  usdValue: number;
  source?: string;          // 'Binance'|'OKX'|'Deribit'|'IBKR'|'长桥'|'同花顺'|free
  fee?: number;             // in `currency`
  note?: string;
}

interface TradeState {
  trades: Trade[];
  addTrade: (trade: Omit<Trade, 'id'>) => void;
  updateTrade: (id: string, patch: Partial<Omit<Trade, 'id'>>) => void;
  removeTrade: (id: string) => void;
  importTrades: (incoming: Trade[]) => void;
  clearAll: () => void;
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTradeStore = create<TradeState>()(
  persist(
    (set) => ({
      trades: [],
      addTrade: (trade) =>
        set((state) => ({
          trades: [...state.trades, { ...trade, id: genId() }].sort(
            (a, b) => a.timestamp - b.timestamp
          ),
        })),
      updateTrade: (id, patch) =>
        set((state) => ({
          trades: state.trades
            .map((t) => (t.id === id ? { ...t, ...patch } : t))
            .sort((a, b) => a.timestamp - b.timestamp),
        })),
      removeTrade: (id) =>
        set((state) => ({
          trades: state.trades.filter((t) => t.id !== id),
        })),
      importTrades: (incoming) =>
        set((state) => {
          const map = new Map(state.trades.map((t) => [t.id, t]));
          for (const t of incoming) map.set(t.id, t);
          return {
            trades: Array.from(map.values()).sort(
              (a, b) => a.timestamp - b.timestamp
            ),
          };
        }),
      clearAll: () => set({ trades: [] }),
    }),
    {
      name: 'crypto-dashboard-trades',
      version: 1,
      migrate: (state) => state as TradeState,
    }
  )
);

export interface TradeDayBucket {
  timestamp: number;        // ms of the earliest trade that day (for sorting / placement)
  trades: Trade[];          // sorted ascending by timestamp
  netUsd: number;           // +buys − sells, signed
  totalCount: number;
  buyCount: number;
  sellCount: number;
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function bucketTradesByDay(trades: Trade[]): TradeDayBucket[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = dayKey(t.timestamp);
    const arr = groups.get(k);
    if (arr) arr.push(t);
    else groups.set(k, [t]);
  }
  return [...groups.values()].map((ts) => {
    const sorted = ts.slice().sort((a, b) => a.timestamp - b.timestamp);
    let netUsd = 0;
    let buyCount = 0;
    let sellCount = 0;
    for (const t of sorted) {
      const signed = t.direction === 'buy' ? t.usdValue : -t.usdValue;
      netUsd += signed;
      if (t.direction === 'buy') buyCount++;
      else sellCount++;
    }
    return {
      timestamp: sorted[0].timestamp,
      trades: sorted,
      netUsd,
      totalCount: sorted.length,
      buyCount,
      sellCount,
    };
  });
}
