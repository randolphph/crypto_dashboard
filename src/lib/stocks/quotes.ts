import 'server-only';
import type { StockQuote } from '@/types/stocks';

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

function aShareCode(symbol: string): string {
  const s = symbol.replace(/^(sh|sz|bj)/i, '').trim();
  if (/^(60|68|9)/.test(s)) return `sh${s}`;
  if (/^(00|30|20)/.test(s)) return `sz${s}`;
  if (/^(43|83|87|88|92)/.test(s)) return `bj${s}`;
  if (/^[68]/.test(s)) return `sh${s}`;
  return `sz${s}`;
}

function hkCode(symbol: string): string {
  const s = symbol.replace(/^hk/i, '').trim();
  return `hk${s.padStart(5, '0')}`;
}

export async function fetchAShareQuotes(symbols: string[]): Promise<StockQuote[]> {
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

export async function fetchHkQuotes(symbols: string[]): Promise<StockQuote[]> {
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

export async function fetchUsQuotes(symbols: string[]): Promise<StockQuote[]> {
  if (symbols.length === 0) return [];
  return Promise.all(symbols.map(fetchUsQuote));
}
