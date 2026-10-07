import type { AssetBalance } from './common';

export type EvmChain =
  | 'ethereum'
  | 'optimism'
  | 'arbitrum'
  | 'base'
  | 'bsc'
  | 'plasma'
  | 'robinhood';
export type Chain = EvmChain | 'hyperliquid' | 'solana' | 'bitcoin';

/** @deprecated Use Chain instead */
export type Network = Chain;

export interface WalletConfig {
  id: string;
  name: string;
  address: string;
  chains: Chain[];
  /** @deprecated Use chains instead */
  network?: Chain;
}

export type DefiInvestType = 'save' | 'pool' | 'farm' | 'vaults' | 'stake' | 'other';

export interface DefiPositionToken {
  symbol: string;
  amount: number;
  usdValue: number;
  logo?: string;
}

export interface DefiPositionItem {
  type: DefiInvestType;
  totalUsdValue: number;
  tokens: DefiPositionToken[];
}

export interface DefiProtocolPosition {
  platformId: string;
  platformName: string;
  platformLogo?: string;
  platformUrl?: string;
  network: string;
  chainId: string;
  totalUsdValue: number;
  positions: DefiPositionItem[];
}

export interface WalletBalance {
  walletId: string;
  walletName: string;
  address: string;
  chains: Chain[];
  balances: AssetBalance[];
  totalUsdValue: number;
  defiPositions?: DefiProtocolPosition[];
  defiTotalUsdValue?: number;
  dataQuality?: {
    complete: boolean;
    errors: string[];
  };
  error?: string;
  // Actual upstream collection time; reading a cache never advances it.
  dataUpdatedAt?: number;
  cache?: {
    source: 'live' | 'server' | 'browser';
    refreshing: boolean;
    refreshError?: string;
  };
}
