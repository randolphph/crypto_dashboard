import type { StockCurrency } from '@/types/stocks';

export interface GoldHolding {
  id: string;
  name: string;
  grams: number;
  buyPricePerGram: number;
  currency: StockCurrency;
}

export interface ValuedGoldHolding extends GoldHolding {
  costLocal: number;
  costUsd: number | null;
  valueUsd: number | null;
  pnlUsd: number | null;
  valuationBasis: 'cost' | 'spot' | 'unavailable';
  valueCny?: number | null;
  costCny?: number | null;
  pnlCny?: number | null;
  priceCnyPerGram?: number;
  priceUsdPerGram?: number;
  priceUpdatedAt?: string;
  priceSource?: string;
  priceStatus?: 'live' | 'stale';
}

export interface GoldQuote {
  symbol: 'Au99.99';
  currency: 'CNY';
  unit: 'gram';
  price: number;
  source: 'sina-sge';
  updatedAt: string;
  receivedAt: string;
  status: 'live' | 'stale';
  error?: string;
}
