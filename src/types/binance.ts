export type BinanceExecutionMarket = 'spot' | 'usdm' | 'coinm';

export interface BinanceExecution {
  externalId: string;
  market: BinanceExecutionMarket;
  timestamp: number;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  quoteQuantity?: number;
  quoteAsset: string;
  commission: number;
  commissionAsset: string;
  /** Coin-margined contracts are contract counts, not base-asset quantities. */
  isContractQuantity?: boolean;
}
