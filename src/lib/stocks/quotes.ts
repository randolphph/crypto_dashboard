import 'server-only';
import { redis } from '@/lib/cache/upstash';
import type { StockCurrency, StockMarket, StockQuote } from '@/types/stocks';

function decodeBuffer(buf: ArrayBuffer, fallback = 'utf-8'): string {
  try {
    return new TextDecoder('gbk').decode(buf);
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buf);
    } catch {
      return new TextDecoder(fallback).decode(buf);
    }
  }
}

// Quotes change minute-by-minute during trading. 60s is fresh enough while
// still letting most refreshes hit cache and skip the upstream entirely.
// Store the row 24h so stale-on-error fallback has something to return when
// upstream sources are 403/down.
const QUOTE_FRESH_TTL_MS = 60_000;
const QUOTE_STORE_TTL_S = 24 * 60 * 60;

type CacheMarket = 'a' | 'hk' | 'us';

interface QuoteCacheEntry {
  quote: StockQuote;
  ts: number;
}

async function readQuoteCacheBatch(
  market: CacheMarket,
  symbols: string[]
): Promise<(QuoteCacheEntry | null)[]> {
  if (!redis || symbols.length === 0) return symbols.map(() => null);
  const keys = symbols.map((s) => `quote:${market}:${s}`);
  try {
    const results = (await redis.mget(...keys)) as (QuoteCacheEntry | null)[];
    return results.map((r) => r ?? null);
  } catch {
    return symbols.map(() => null);
  }
}

async function writeQuoteCache(
  market: CacheMarket,
  symbol: string,
  entry: QuoteCacheEntry
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`quote:${market}:${symbol}`, entry, {
      ex: QUOTE_STORE_TTL_S,
    });
  } catch {
    // Caching is best-effort; never let a cache write break the request.
  }
}

const CACHE_MARKET_META: Record<
  CacheMarket,
  { market: StockMarket; currency: StockCurrency }
> = {
  a: { market: 'A', currency: 'CNY' },
  hk: { market: 'HK', currency: 'HKD' },
  us: { market: 'US', currency: 'USD' },
};

// Two-stage cache wrapper: serve fresh rows from Upstash, fetch the rest, then
// fall back to stale rows when upstream errors out. Keeps each per-market
// fetcher focused on its upstream protocol while sharing the same cache shape.
async function withQuoteCache(
  market: CacheMarket,
  symbols: string[],
  fetchFresh: (toFetch: string[]) => Promise<StockQuote[]>
): Promise<StockQuote[]> {
  if (symbols.length === 0) return [];
  const cached = await readQuoteCacheBatch(market, symbols);
  const now = Date.now();

  const needRefresh: string[] = [];
  for (let i = 0; i < symbols.length; i++) {
    const c = cached[i];
    if (!c || now - c.ts >= QUOTE_FRESH_TTL_MS) {
      needRefresh.push(symbols[i]);
    }
  }

  const freshMap = new Map<string, StockQuote>();
  if (needRefresh.length > 0) {
    const fresh = await fetchFresh(needRefresh);
    for (const q of fresh) freshMap.set(q.symbol, q);
    await Promise.all(
      [...freshMap.values()]
        .filter(isQuoteOk)
        .map((q) => writeQuoteCache(market, q.symbol, { quote: q, ts: now }))
    );
  }

  const meta = CACHE_MARKET_META[market];
  return symbols.map((s, i) => {
    const c = cached[i];
    if (c && now - c.ts < QUOTE_FRESH_TTL_MS) return c.quote;
    const fresh = freshMap.get(s);
    if (isQuoteOk(fresh)) return fresh;
    if (c) return c.quote;
    return (
      fresh ?? {
        symbol: s,
        market: meta.market,
        price: 0,
        currency: meta.currency,
        error: 'no data',
      }
    );
  });
}

function aShareCode(symbol: string): string {
  const s = symbol.replace(/^(sh|sz|bj)/i, '').trim();
  // SSE: 60x stocks, 68x STAR, 9xx B-shares, 5xx funds/ETFs/LOFs.
  // SZSE: 00x/30x stocks, 20x B-shares, 15x/16x/18x funds/ETFs.
  // BSE: 43/83/87/88/92.
  if (/^(60|68|9|5)/.test(s)) return `sh${s}`;
  if (/^(00|30|20|15|16|18)/.test(s)) return `sz${s}`;
  if (/^(43|83|87|88|92)/.test(s)) return `bj${s}`;
  if (/^[68]/.test(s)) return `sh${s}`;
  return `sz${s}`;
}

function hkCode(symbol: string): string {
  const s = symbol.replace(/^hk/i, '').trim();
  return `hk${s.padStart(5, '0')}`;
}

async function fetchAShareFromSina(
  symbols: string[]
): Promise<StockQuote[]> {
  if (symbols.length === 0) return [];
  const codes = symbols.map(aShareCode);
  const url = `https://hq.sinajs.cn/list=${codes.join(',')}`;
  let text: string;
  try {
    const res = await fetch(url, {
      headers: {
        Referer: 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      return symbols.map((s) => ({
        symbol: s,
        market: 'A' as const,
        price: 0,
        currency: 'CNY' as const,
        error: `sina http ${res.status}`,
      }));
    }
    text = decodeBuffer(await res.arrayBuffer());
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch error';
    return symbols.map((s) => ({
      symbol: s,
      market: 'A' as const,
      price: 0,
      currency: 'CNY' as const,
      error: msg,
    }));
  }

  return codes.map((code, i) => {
    const line = text.split('\n').find((l) => l.includes(`hq_str_${code}`));
    if (!line) {
      return {
        symbol: symbols[i],
        market: 'A' as const,
        price: 0,
        currency: 'CNY' as const,
        error: 'quote not found',
      };
    }
    const m = line.match(/"([^"]*)"/);
    if (!m || !m[1]) {
      return {
        symbol: symbols[i],
        market: 'A' as const,
        price: 0,
        currency: 'CNY' as const,
        error: 'empty quote',
      };
    }
    const fields = m[1].split(',');
    const name = fields[0];
    const prevClose = parseFloat(fields[2]);
    const price = parseFloat(fields[3]);
    if (!Number.isFinite(price) || price === 0) {
      return {
        symbol: symbols[i],
        market: 'A' as const,
        price: 0,
        currency: 'CNY' as const,
        name,
        error: 'no current price',
      };
    }
    const changePct =
      Number.isFinite(prevClose) && prevClose > 0
        ? ((price - prevClose) / prevClose) * 100
        : undefined;
    return {
      symbol: symbols[i],
      market: 'A' as const,
      name,
      price,
      currency: 'CNY' as const,
      changePct,
    };
  });
}

// Tencent accepts the same sh/sz/bj prefixes as Sina for A-shares, and its
// edge nodes have a different IP-rate-limiting policy — useful as a fallback
// when Sina starts returning 403 to Vercel egress IPs.
async function fetchAShareFromTencent(
  symbols: string[]
): Promise<StockQuote[]> {
  if (symbols.length === 0) return [];
  const codes = symbols.map(aShareCode);
  const url = `https://qt.gtimg.cn/q=${codes.join(',')}`;
  let text: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return symbols.map((s) => ({
        symbol: s,
        market: 'A' as const,
        price: 0,
        currency: 'CNY' as const,
        error: `tencent http ${res.status}`,
      }));
    }
    text = decodeBuffer(await res.arrayBuffer());
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch error';
    return symbols.map((s) => ({
      symbol: s,
      market: 'A' as const,
      price: 0,
      currency: 'CNY' as const,
      error: msg,
    }));
  }

  return codes.map((code, i) => {
    const line = text.split('\n').find((l) => l.includes(`v_${code}`));
    if (!line) {
      return {
        symbol: symbols[i],
        market: 'A' as const,
        price: 0,
        currency: 'CNY' as const,
        error: 'tencent quote not found',
      };
    }
    const m = line.match(/"([^"]*)"/);
    if (!m || !m[1]) {
      return {
        symbol: symbols[i],
        market: 'A' as const,
        price: 0,
        currency: 'CNY' as const,
        error: 'tencent empty quote',
      };
    }
    const fields = m[1].split('~');
    // Tencent generic format: 0=market, 1=name, 2=code, 3=price, 4=prevClose
    const name = fields[1];
    const price = parseFloat(fields[3]);
    const prevClose = parseFloat(fields[4]);
    if (!Number.isFinite(price) || price === 0) {
      return {
        symbol: symbols[i],
        market: 'A' as const,
        price: 0,
        currency: 'CNY' as const,
        name,
        error: 'tencent no current price',
      };
    }
    const changePct =
      Number.isFinite(prevClose) && prevClose > 0
        ? ((price - prevClose) / prevClose) * 100
        : undefined;
    return {
      symbol: symbols[i],
      market: 'A' as const,
      name,
      price,
      currency: 'CNY' as const,
      changePct,
    };
  });
}

function isQuoteOk(q: StockQuote | undefined): q is StockQuote {
  return !!q && !q.error && q.price > 0;
}

// Sina is primary; Tencent fills in for symbols Sina refuses to serve (typical
// when Vercel egress IPs hit a 403).
async function fetchAShareFresh(symbols: string[]): Promise<StockQuote[]> {
  const sina = await fetchAShareFromSina(symbols);
  const map = new Map<string, StockQuote>();
  for (const q of sina) map.set(q.symbol, q);

  const sinaFailed = sina
    .filter((q) => !!q.error || q.price === 0)
    .map((q) => q.symbol);
  if (sinaFailed.length > 0) {
    const tencent = await fetchAShareFromTencent(sinaFailed);
    for (const q of tencent) {
      if (isQuoteOk(q)) map.set(q.symbol, q);
    }
  }
  return symbols.map((s) => map.get(s)!).filter(Boolean);
}

export async function fetchAShareQuotes(
  symbols: string[]
): Promise<StockQuote[]> {
  return withQuoteCache('a', symbols, fetchAShareFresh);
}

async function fetchHkFresh(symbols: string[]): Promise<StockQuote[]> {
  if (symbols.length === 0) return [];
  const codes = symbols.map(hkCode);
  const url = `https://qt.gtimg.cn/q=${codes.join(',')}`;
  let text: string;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) {
      return symbols.map((s) => ({
        symbol: s,
        market: 'HK' as const,
        price: 0,
        currency: 'HKD' as const,
        error: `tencent http ${res.status}`,
      }));
    }
    text = decodeBuffer(await res.arrayBuffer());
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch error';
    return symbols.map((s) => ({
      symbol: s,
      market: 'HK' as const,
      price: 0,
      currency: 'HKD' as const,
      error: msg,
    }));
  }

  return codes.map((code, i) => {
    const line = text.split('\n').find((l) => l.includes(`v_${code}`));
    if (!line) {
      return {
        symbol: symbols[i],
        market: 'HK' as const,
        price: 0,
        currency: 'HKD' as const,
        error: 'quote not found',
      };
    }
    const m = line.match(/"([^"]*)"/);
    if (!m || !m[1]) {
      return {
        symbol: symbols[i],
        market: 'HK' as const,
        price: 0,
        currency: 'HKD' as const,
        error: 'empty quote',
      };
    }
    const fields = m[1].split('~');
    // Tencent HK format: 100 ~ name ~ code ~ price ~ prevClose ~ open ~ ...
    const name = fields[1];
    const price = parseFloat(fields[3]);
    const prevClose = parseFloat(fields[4]);
    if (!Number.isFinite(price) || price === 0) {
      return {
        symbol: symbols[i],
        market: 'HK' as const,
        price: 0,
        currency: 'HKD' as const,
        name,
        error: 'no current price',
      };
    }
    const changePct =
      Number.isFinite(prevClose) && prevClose > 0
        ? ((price - prevClose) / prevClose) * 100
        : undefined;
    return {
      symbol: symbols[i],
      market: 'HK' as const,
      name,
      price,
      currency: 'HKD' as const,
      changePct,
    };
  });
}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchYahooQuote(symbol: string): Promise<StockQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.chart?.error) return null;
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    if (!Number.isFinite(price) || price === 0) return null;
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    const changePct =
      Number.isFinite(prev) && prev > 0
        ? ((price - prev) / prev) * 100
        : undefined;
    return {
      symbol,
      market: 'US',
      name: meta.shortName ?? meta.longName,
      price,
      currency: 'USD',
      changePct,
    };
  } catch {
    return null;
  }
}

async function fetchStooqQuote(symbol: string): Promise<StockQuote> {
  const code = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(code)}&f=sd2t2ohlc&h&e=csv`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return {
        symbol,
        market: 'US',
        price: 0,
        currency: 'USD',
        error: `stooq http ${res.status}`,
      };
    }
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      return {
        symbol,
        market: 'US',
        price: 0,
        currency: 'USD',
        error: 'stooq empty response',
      };
    }
    const fields = lines[1].split(',');
    // Symbol,Date,Time,Open,High,Low,Close
    const open = parseFloat(fields[3]);
    const close = parseFloat(fields[6]);
    if (!Number.isFinite(close) || close === 0) {
      return {
        symbol,
        market: 'US',
        price: 0,
        currency: 'USD',
        error: 'stooq no price',
      };
    }
    const changePct =
      Number.isFinite(open) && open > 0 ? ((close - open) / open) * 100 : undefined;
    return {
      symbol,
      market: 'US',
      price: close,
      currency: 'USD',
      changePct,
    };
  } catch (e) {
    return {
      symbol,
      market: 'US',
      price: 0,
      currency: 'USD',
      error: e instanceof Error ? e.message : 'fetch error',
    };
  }
}

async function fetchUsQuote(symbol: string): Promise<StockQuote> {
  const yahoo = await fetchYahooQuote(symbol);
  if (yahoo) return yahoo;
  return fetchStooqQuote(symbol);
}

async function fetchUsFresh(symbols: string[]): Promise<StockQuote[]> {
  return Promise.all(symbols.map(fetchUsQuote));
}

export async function fetchHkQuotes(symbols: string[]): Promise<StockQuote[]> {
  return withQuoteCache('hk', symbols, fetchHkFresh);
}

export async function fetchUsQuotes(symbols: string[]): Promise<StockQuote[]> {
  return withQuoteCache('us', symbols, fetchUsFresh);
}
