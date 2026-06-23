import {
  fetchAShareQuotes,
  fetchHkQuotes,
  fetchKrQuotes,
  fetchUsQuotes,
} from '@/lib/stocks/quotes';
import type { StockMarket, StockQuote } from '@/types/stocks';

export const dynamic = 'force-dynamic';

// Lightweight quote-only endpoint. The dashboard's /api/stocks only quotes
// symbols you actually HOLD (it builds its symbol lists from the positions
// store), so a加仓 watch-list name you haven't bought yet gets no price. This
// route fills that gap: feed it {market, symbol} pairs, get back local-currency
// quotes. The accumulation view only sends the names NOT already covered by the
// shared useStockData() feed, so this stays a tiny supplemental fetch.

interface WatchSymbol {
  market: StockMarket;
  symbol: string;
}

function isWatchSymbol(x: unknown): x is WatchSymbol {
  if (!x || typeof x !== 'object') return false;
  const w = x as Record<string, unknown>;
  return (
    (w.market === 'A' || w.market === 'HK' || w.market === 'US' || w.market === 'KR') &&
    typeof w.symbol === 'string' &&
    w.symbol.trim().length > 0
  );
}

export async function POST(request: Request) {
  let body: { symbols?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const symbols = Array.isArray(body.symbols)
    ? body.symbols.filter(isWatchSymbol)
    : [];

  const uniq = (xs: string[]) =>
    [...new Set(xs.map((s) => s.trim()))].filter(Boolean);
  const byMarket = (m: StockMarket) =>
    uniq(symbols.filter((s) => s.market === m).map((s) => s.symbol));

  const [aQuotes, hQuotes, uQuotes, kQuotes] = await Promise.all([
    fetchAShareQuotes(byMarket('A')),
    fetchHkQuotes(byMarket('HK')),
    fetchUsQuotes(byMarket('US')),
    fetchKrQuotes(byMarket('KR')),
  ]);

  const quotes: StockQuote[] = [...aQuotes, ...hQuotes, ...uQuotes, ...kQuotes];
  return Response.json({ quotes, lastUpdated: new Date().toISOString() });
}
