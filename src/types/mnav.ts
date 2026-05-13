export const MNAV_INTERVALS = ['1h', '1d', '1w', '1M', '1Q', '1Y'] as const;
export type MnavInterval = (typeof MNAV_INTERVALS)[number];

export interface MnavPoint {
  ts: number;
  mstrClose: number;
  btcClose: number;
  sharesOutstanding: number;
  btcHoldings: number;
  marketCap: number;
  nav: number;
  mnav: number;
  isExtrapolated: boolean;
}

export interface MnavResponse {
  interval: MnavInterval;
  updatedAt: number;
  points: MnavPoint[];
}

export interface HoldingsPoint {
  effectiveDate: string;
  btc: number;
  filingUrl: string;
  accession?: string;
}

export interface SharesPoint {
  effectiveDate: string;
  shares: number;
  filingUrl: string;
}

export interface MnavHealth {
  ok: boolean;
  lastFetch: {
    binance: number;
    mstrPrice: number;
    secShares: number;
    secHoldings: number;
  };
  latestHoldings: { btc: number; asOf: number; filing: string };
  latestShares: { shares: number; asOf: number; filing: string };
}
