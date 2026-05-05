export interface AssetBalance {
  asset: string;
  amount: number;
  usdValue: number;
  tokenAddress?: string;
  chainId?: string;
  // True when this token has been judged a DeFi receipt (LST, aToken, LP, etc.)
  // already represented inside defiPositions. Still rendered for transparency
  // but excluded from the wallet's totalUsdValue.
  dedupedToDefi?: boolean;
}

export interface ExchangeData {
  exchange: string;
  balances: AssetBalance[];
  totalUsdValue: number;
  lastUpdated: string;
  error?: string;
}
