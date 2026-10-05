export interface AssetBalance {
  asset: string;
  amount: number;
  usdValue: number;
  tokenAddress?: string;
  chainId?: string;
  logo?: string;
  // Excluded from asset totals: represented in DeFi positions, or an aToken
  // excluded by policy regardless of DeFi availability. Kept for display.
  dedupedToDefi?: boolean;
  exclusionReason?: 'aave-receipt';
}

export interface ExchangeData {
  exchange: string;
  balances: AssetBalance[];
  totalUsdValue: number;
  lastUpdated: string;
  error?: string;
}
