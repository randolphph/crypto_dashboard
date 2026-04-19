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

export interface WalletBalance {
  walletId: string;
  walletName: string;
  address: string;
  chains: Chain[];
  balances: AssetBalance[];
  totalUsdValue: number;
  error?: string;
}
