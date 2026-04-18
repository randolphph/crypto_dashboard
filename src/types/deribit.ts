import type { AssetBalance } from './common';

export interface DeribitPosition {
  instrument_name: string;
  direction: 'buy' | 'sell';
  size: number;
  average_price: number;
  mark_price: number;
  floating_profit_loss: number;
  total_profit_loss: number;
  kind: string;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface DeribitAccountSummary {
  currency: string;
  equity: number;
  balance: number;
  margin_balance: number;
  available_withdrawal_funds: number;
  initial_margin: number;
  maintenance_margin: number;
  total_equity_usd: number;
  options_value: number;
}

export interface DeribitData {
  configured?: boolean;
  positions: DeribitPosition[];
  accountSummaries: DeribitAccountSummary[];
  balances: AssetBalance[];
  totalUsdValue: number;
  lastUpdated: string;
  error?: string;
}
