import type { AssetBalance } from './common';

export type Network = 'ethereum' | 'solana';

export interface TrackedToken {
  symbol: string;
  contractAddress: string;
  decimals: number;
  coingeckoId?: string;
}

export interface WalletConfig {
  id: string;
  name: string;
  address: string;
  network: Network;
  trackedTokens: TrackedToken[];
}

export interface WalletBalance {
  walletId: string;
  walletName: string;
  address: string;
  network: Network;
  balances: AssetBalance[];
  totalUsdValue: number;
  error?: string;
}
