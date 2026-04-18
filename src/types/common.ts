export interface AssetBalance {
  asset: string;
  amount: number;
  usdValue: number;
}

export interface ExchangeData {
  exchange: string;
  balances: AssetBalance[];
  totalUsdValue: number;
  lastUpdated: string;
  error?: string;
}
