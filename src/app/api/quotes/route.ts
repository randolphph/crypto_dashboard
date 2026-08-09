import {
  fetchAShareQuotes,
  fetchHkQuotes,
  fetchKrQuotes,
  fetchUsQuotes,
} from '@/lib/stocks/quotes';
import type { StockMarket, StockQuote } from '@/types/stocks';
import {
  enforceRateLimit,
  inputErrorResponse,
  readJsonBody,
} from '@/lib/http/guards';
import { parseMarketSymbols } from '@/lib/http/validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

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

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'quotes', 30, 60);
  if (limited) return limited;

  let symbols: WatchSymbol[];
  try {
    const body = (await readJsonBody(request)) as { symbols?: unknown };
    symbols = parseMarketSymbols(body?.symbols, 50);
  } catch (error) {
    return inputErrorResponse(error);
  }

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
