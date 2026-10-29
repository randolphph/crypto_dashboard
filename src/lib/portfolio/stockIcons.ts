import type { StockMarket } from '@/types/stocks';

export function bundledStockIconUrl(market: string, symbol: string): string | null {
  const raw = symbol.trim().toUpperCase();
  const cmb = market === 'A' && ['600036', '600036.SH', '600036.SS', 'SH600036'].includes(raw)
    || market === 'HK' && ['3968', '03968', '3968.HK', '03968.HK', 'HK3968', 'HK03968'].includes(raw);
  return cmb ? '/stock-icons/china-merchants-bank-5db6ec2e10.png' : null;
}

export function stockIconUrl(market: StockMarket, symbol: string) {
  return bundledStockIconUrl(market, symbol) ?? `/api/stock-logo/${market}/${encodeURIComponent(symbol)}`;
}
