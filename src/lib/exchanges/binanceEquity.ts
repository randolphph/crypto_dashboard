import 'server-only';
import { fetchWithTimeout } from '@/lib/http/fetch';

const EQUITY_ASSET = /^EQ_[A-Z][A-Z0-9.-]{0,19}$/;
const CACHE_TTL = 30_000;
// These are market quotes, never account balances or credentials.
const quotes = new Map<string, { price: number; expiresAt: number }>();

export function isBinanceEquityAsset(asset: string): boolean {
  return EQUITY_ASSET.test(asset);
}

/** EQ_ codes are internal equity balances, not crypto spot ticker symbols. */
export async function fetchBinanceEquityPrices(
  assets: string[],
  apiKey: string
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const uniqueAssets = [...new Set(assets.filter(isBinanceEquityAsset))];
  // Bound concurrency when an account holds many equities.
  for (let start = 0; start < uniqueAssets.length; start += 5) {
    await Promise.all(uniqueAssets.slice(start, start + 5).map(async (asset) => {
      const cached = quotes.get(asset);
      if (cached && cached.expiresAt > Date.now()) {
        prices[asset] = cached.price;
        return;
      }
      try {
        const symbol = asset.slice(3);
        const response = await fetchWithTimeout(
          `https://api.binance.com/sapi/v1/equity/market/quote?${new URLSearchParams({ symbol })}`,
          { headers: { 'X-MBX-APIKEY': apiKey }, cache: 'no-store' }
        );
        if (!response.ok) return;
        // Binance returns an empty body when a ticker has no available quote.
        const body = await response.text();
        if (!body.trim()) return;
        const quote = JSON.parse(body) as { symbol?: string; bidPrice?: string; askPrice?: string } | null;
        const bid = Number(quote?.bidPrice), ask = Number(quote?.askPrice);
        if (quote?.symbol !== symbol || !Number.isFinite(bid) || !Number.isFinite(ask) ||
            bid <= 0 || ask <= 0 || bid > ask) return;
        const price = bid / 2 + ask / 2;
        quotes.set(asset, { price, expiresAt: Date.now() + CACHE_TTL });
        prices[asset] = price;
      } catch {
        // The caller keeps missing prices visible in dataQuality. Never cache
        // failures or reuse expired quotes as if this refresh had succeeded.
      }
    }));
  }
  return prices;
}
