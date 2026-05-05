import type { AssetBalance } from './common';

export type EvmChain = 'ethereum' | 'optimism' | 'arbitrum' | 'base' | 'bsc';
export type Chain = EvmChain | 'solana' | 'bitcoin';

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
  error?: string;
}
