export type SnapshotSource =
  | 'binance'
  | 'okx'
  | 'deribit'
  | 'onchain'
  | 'ths'
  | 'longport'
  | 'ibkr'
  | 'bank';

export type SnapshotKind =
  | 'crypto'         // non-stable spot or stake
  | 'crypto_perp'    // futures / perp position
  | 'stock'
  | 'option'
  | 'token'          // on-chain token (incl. stables)
  | 'cash'
  | 'defi';

export interface PositionSnapshot {
  source: SnapshotSource;
  account?: string;
  symbol: string;
  kind: SnapshotKind;
  market?: string;
  qty: number;
  // Explicit direction for AI consumers. Spot balances omit this (implicitly
  // long); positions with directional risk (stocks, futures, options) set it.
  side?: 'long' | 'short';
  // Cost basis / average entry. Set when the upstream API gives it
  // (IBKR costBasis, Binance futures entryPrice, Deribit average_price).
  entryPrice?: number;
  priceLocal?: number;
  currency: string;
  valueLocal?: number;
  valueUsd: number;
  pnlLocal?: number;
  pnlUsd?: number;
  changePct?: number;
  // Derivatives-only metadata. Populated for options (put/call + strike +
  // expiry) and for perps (markPrice + leverage).
  optionType?: 'put' | 'call';
  strike?: number;
  expiry?: string; // ISO yyyy-mm-dd
  underlying?: string;
  markPrice?: number;
  leverage?: number;
  raw?: unknown;
}

export interface PortfolioSummarySnapshot {
  totalUsd: number;
  cryptoUsd?: number;
  stocksUsd?: number;
  cashUsd?: number;
  otherUsd?: number;
  // Authoritative Deribit account equity from the API. Used by the AI export
  // because summing flattened positions over/undercounts depending on which
  // shorts are open at snapshot time.
  deribitTotalUsd?: number;
  fxCnyUsd?: number;
  fxHkdUsd?: number;
  fxKrwUsd?: number;
  raw?: unknown;
}

export interface SnapshotPayload {
  // Lowercased EVM address of the wallet that's currently unlocking the vault.
  // Backend partitions all rows by this so multiple users / envs don't mix.
  wallet: string;
  timestamp: number;
  positions: PositionSnapshot[];
  portfolio: PortfolioSummarySnapshot;
}
