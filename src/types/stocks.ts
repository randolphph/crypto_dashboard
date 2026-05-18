export type StockMarket = 'A' | 'HK' | 'US';
export type StockBroker = 'ths' | 'longport' | 'ibkr';
export type StockCurrency = 'CNY' | 'HKD' | 'USD';

export const BROKER_LABEL: Record<StockBroker, string> = {
  ths: 'A股 (同花顺)',
  longport: '长桥',
  ibkr: 'IBKR',
};

export const MARKET_LABEL: Record<StockMarket, string> = {
  A: 'A股',
  HK: '港股',
  US: '美股',
};

export const MARKET_CURRENCY: Record<StockMarket, StockCurrency> = {
  A: 'CNY',
  HK: 'HKD',
  US: 'USD',
};

export interface StockPosition {
  id: string;
  broker: StockBroker;
  market: StockMarket;
  symbol: string;
  name?: string;
  shares: number;
  costBasis?: number;
}

export interface StockQuote {
  symbol: string;
  market: StockMarket;
  price: number;
  currency: StockCurrency;
  changePct?: number;
  name?: string;
  error?: string;
}

export interface EnrichedPosition extends StockPosition {
  price: number;
  currency: StockCurrency;
  marketValue: number;
  marketValueUsd: number;
  pnl?: number;
  pnlUsd?: number;
  pnlPct?: number;
  changePct?: number;
  quoteName?: string;
  quoteError?: string;
}

export interface CashBalance {
  id: string;
  broker: StockBroker;
  currency: StockCurrency;
  amount: number;
  note?: string;
}

export interface EnrichedCashBalance extends CashBalance {
  amountUsd: number;
}

export interface BrokerData {
  broker: StockBroker;
  positions: EnrichedPosition[];
  cash: EnrichedCashBalance[];
  positionsUsdValue: number;
  cashUsdValue: number;
  totalUsdValue: number;
  totalPnlUsd: number;
}

export interface FxRates {
  cnyUsd: number;
  hkdUsd: number;
}

export interface StocksData {
  brokers: BrokerData[];
  fx: FxRates;
  lastUpdated: string;
}
