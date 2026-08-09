export type StockMarket = 'A' | 'HK' | 'US' | 'KR';
export type StockBroker = 'ths' | 'longport' | 'ibkr';
export type StockCurrency = 'CNY' | 'HKD' | 'USD' | 'KRW';
export type DataSource = 'manual' | 'api';

export const BROKER_LABEL: Record<StockBroker, string> = {
  ths: 'A股 (同花顺)',
  longport: '长桥',
  ibkr: 'IBKR',
};

export const MARKET_LABEL: Record<StockMarket, string> = {
  A: 'A股',
  HK: '港股',
  US: '美股',
  KR: '韩股',
};

export const MARKET_CURRENCY: Record<StockMarket, StockCurrency> = {
  A: 'CNY',
  HK: 'HKD',
  US: 'USD',
  KR: 'KRW',
};

export type InstrumentKind = 'stock' | 'option';

export interface StockPosition {
  id: string;
  broker: StockBroker;
  market: StockMarket;
  symbol: string;
  name?: string;
  shares: number;
  costBasis?: number;
  // PnL provided directly by the broker API (in the position's local currency).
  // When present, used instead of `(price - costBasis) * shares` to avoid
  // discrepancies with the broker's own accounting (FIFO vs avg-cost, etc.).
  apiPnl?: number;
  // Contract size for derivatives. 1 for stocks; for HK options typically
  // matches the underlying lot size (e.g., 500 for 0700).
  multiplier?: number;
  kind?: InstrumentKind;
}

export interface StockQuote {
  symbol: string;
  market: StockMarket;
  price: number;
  currency: StockCurrency;
  // When this price was fetched from its upstream source. Cache hits retain
  // the original timestamp so the UI can reveal stale fallback data.
  priceUpdatedAt?: string;
  changePct?: number;
  name?: string;
  error?: string;
}

export interface EnrichedPosition extends StockPosition {
  price: number;
  priceUpdatedAt?: string;
  currency: StockCurrency;
  marketValue: number;
  marketValueUsd: number;
  pnl?: number;
  pnlUsd?: number;
  pnlPct?: number;
  changePct?: number;
  quoteName?: string;
  quoteError?: string;
  source: DataSource;
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
  source: DataSource;
}

export interface BrokerData {
  broker: StockBroker;
  positions: EnrichedPosition[];
  cash: EnrichedCashBalance[];
  positionsUsdValue: number;
  cashUsdValue: number;
  totalUsdValue: number;
  totalPnlUsd: number;
  apiError?: string;
}

export interface FxRates {
  cnyUsd: number;
  hkdUsd: number;
  krwUsd: number;
}

export interface StocksData {
  brokers: BrokerData[];
  fx: FxRates;
  lastUpdated: string;
  dataQuality?: {
    complete: boolean;
    errors: string[];
  };
}
