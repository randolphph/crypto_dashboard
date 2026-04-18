import 'server-only';

const SYMBOL_TO_COINGECKO: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDT: 'tether',
  USDC: 'usd-coin',
  WBTC: 'wrapped-bitcoin',
  WETH: 'weth',
  BNB: 'binancecoin',
  DOGE: 'dogecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  ARB: 'arbitrum',
  OP: 'optimism',
};

// Simple in-memory cache
let priceCache: { prices: Record<string, number>; timestamp: number } = {
  prices: {},
  timestamp: 0,
};
const CACHE_TTL = 30_000; // 30 seconds

export async function fetchPrices(
  symbols: string[]
): Promise<Record<string, number>> {
  // Stablecoins
  const stablecoins = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USD1', 'BFUSD', 'LDUSDT', 'RWUSD']);

  // Check cache
  const now = Date.now();
  const uncachedSymbols = symbols.filter(
    (s) => !stablecoins.has(s) && (now - priceCache.timestamp > CACHE_TTL || !(s in priceCache.prices))
  );

  if (uncachedSymbols.length > 0) {
    const coingeckoIds = uncachedSymbols
      .map((s) => SYMBOL_TO_COINGECKO[s])
      .filter(Boolean);

    if (coingeckoIds.length > 0) {
      try {
        const ids = coingeckoIds.join(',');
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
          { next: { revalidate: 30 } }
        );

        if (res.ok) {
          const data = await res.json();
          const newPrices: Record<string, number> = {};
          for (const symbol of uncachedSymbols) {
            const id = SYMBOL_TO_COINGECKO[symbol];
            if (id && data[id]?.usd) {
              newPrices[symbol] = data[id].usd;
            }
          }
          priceCache = {
            prices: { ...priceCache.prices, ...newPrices },
            timestamp: now,
          };
        }
      } catch {
        // Fallback: try Binance ticker
        await fetchBinanceFallbackPrices(uncachedSymbols);
      }
    }

    // For symbols not in CoinGecko mapping, try Binance
    const unmapped = uncachedSymbols.filter((s) => !SYMBOL_TO_COINGECKO[s]);
    if (unmapped.length > 0) {
      await fetchBinanceFallbackPrices(unmapped);
    }
  }

  // Build result
  const result: Record<string, number> = {};
  for (const s of symbols) {
    if (stablecoins.has(s)) {
      result[s] = 1;
    } else {
      result[s] = priceCache.prices[s] ?? 0;
    }
  }

  return result;
}

async function fetchBinanceFallbackPrices(symbols: string[]): Promise<void> {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price');
    if (res.ok) {
      const tickers: Array<{ symbol: string; price: string }> = await res.json();
      const tickerMap = new Map(
        tickers
          .filter((t) => t.symbol.endsWith('USDT'))
          .map((t) => [t.symbol.replace('USDT', ''), parseFloat(t.price)])
      );

      for (const s of symbols) {
        const price = tickerMap.get(s);
        if (price) {
          priceCache.prices[s] = price;
        }
      }
    }
  } catch {
    // silently fail
  }
}
