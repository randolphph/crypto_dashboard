export type SnapshotSource =
  | 'binance'
  | 'okx'
  | 'deribit'
  | 'onchain'
  | 'ths'
  | 'longport'
  | 'ibkr';

export type SnapshotKind =
  | 'crypto'
  | 'stock'
  | 'option'
  | 'token'
  | 'cash'
  | 'defi';

export interface PositionSnapshot {
  source: SnapshotSource;
  account?: string;
  symbol: string;
  kind: SnapshotKind;
  market?: string;
  qty: number;
  priceLocal?: number;
  currency: string;
  valueLocal?: number;
  valueUsd: number;
  pnlLocal?: number;
  pnlUsd?: number;
  changePct?: number;
  raw?: unknown;
}

export interface PortfolioSummarySnapshot {
  totalUsd: number;
  cryptoUsd?: number;
  stocksUsd?: number;
  cashUsd?: number;
  otherUsd?: number;
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
