import 'server-only';
import { createHmac } from 'node:crypto';
import { fetchWithTimeout } from '@/lib/http/fetch';
import * as local from '@/lib/stocks/quotes';
import type { StockMarket, StockPosition, StockQuote } from '@/types/stocks';

type SymbolRow = { market: StockMarket; symbol: string };
type SubscriptionSource = 'manual' | 'ibkr' | 'longport' | 'watch';

export function stockQuoteKey(row: SymbolRow): string {
  let symbol = row.symbol.trim().toUpperCase();
  if (row.market === 'A') {
    const code = symbol.replace(/^(SH|SZ|BJ)/, '');
    const exchange = /^(SH|SZ|BJ)/.exec(symbol)?.[0] ?? (/^(43|83|87|88|92)/.test(code) ? 'BJ' : /^[569]/.test(code) || /^[68]/.test(code) ? 'SH' : 'SZ');
    symbol = `${exchange}${code}`;
  }
  if (row.market === 'HK') symbol = symbol.replace(/^HK/, '').padStart(5, '0');
  return `${row.market}:${symbol}`;
}

async function backendRequest(path: string, body: unknown): Promise<unknown> {
  const base = process.env.CRYPTOSENTRY_API_URL?.trim();
  const token = process.env.CRYPTOSENTRY_API_TOKEN?.trim();
  if (!base || !token) throw new Error('后台行情服务尚未配置');
  const response = await fetchWithTimeout(`${base.replace(/\/+$/, '')}/api/v1/stock-quotes/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), cache: 'no-store',
  }, path === 'subscriptions' ? 4_000 : 20_000);
  if (!response.ok) throw new Error(`后台行情服务 HTTP ${response.status}`);
  return response.json();
}

export async function syncStockSubscriptions(clientId: string | null, source: SubscriptionSource, symbols: SymbolRow[], revision = Date.now()): Promise<boolean> {
  if (!clientId || !/^[a-f0-9-]{36}$/i.test(clientId)) return false;
  const token = process.env.CRYPTOSENTRY_API_TOKEN;
  if (!token) return false;
  const owner = createHmac('sha256', token).update(`stock-quotes:${clientId}`).digest('hex');
  // Contract-specific options must never be subscribed as underlying stocks.
  const unique = [...new Map(symbols.map((symbol) => [stockQuoteKey(symbol), symbol])).values()];
  try { await backendRequest('subscriptions', { owner, source, symbols: unique, revision: Number.isSafeInteger(revision) && revision > 0 ? revision : Date.now() }); return true; }
  catch { return false; }
}

export function stockSymbols(positions: StockPosition[]): SymbolRow[] {
  return positions.filter((position) => position.kind !== 'option' && position.shares !== 0).map(({ market, symbol }) => ({ market, symbol }));
}

interface BackendQuote extends SymbolRow {
  price?: string;
  provider?: string;
  observedAt?: string;
  receivedAt?: string;
  currency?: string;
  priceBasis?: string;
  session?: string;
  name?: string;
  changePct?: number;
  status?: string;
  error?: string;
}

async function quotes(market: StockMarket, symbols: string[]): Promise<StockQuote[]> {
  if (!symbols.length) return [];
  const expectedCurrency = { A: 'CNY', US: 'USD', HK: 'HKD', KR: 'KRW' } as const;
  try {
    const body = await backendRequest('query', { symbols: symbols.map((symbol) => ({ market, symbol })) }) as { quotes?: BackendQuote[] };
    if (!Array.isArray(body.quotes)) throw new Error('后台行情格式无效');
    const byKey = new Map(body.quotes.map((quote) => [stockQuoteKey(quote), quote]));
    return symbols.map((symbol) => {
      const quote = byKey.get(stockQuoteKey({ market, symbol }));
      if (!quote || quote.market !== market || quote.priceBasis !== 'stock' || quote.currency !== expectedCurrency[market] || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0 || !quote.observedAt || !Number.isFinite(Date.parse(quote.observedAt))) {
        return { symbol, market, currency: expectedCurrency[market], price: 0, error: quote?.error ?? '后台正在获取股票行情', priceStatus: 'error' as const };
      }
      return {
        symbol, market, price: Number(quote.price), currency: expectedCurrency[market], name: quote.name,
        changePct: quote.changePct, priceUpdatedAt: quote.observedAt, priceReceivedAt: quote.receivedAt,
        priceSource: quote.provider, priceStatus: quote.status as StockQuote['priceStatus'],
        error: quote.error,
      };
    });
  } catch {
    // Compatibility during backend rollout; never claim a local quote is background data.
    const fallback = market === 'A' ? await local.fetchAShareQuotes(symbols) : market === 'US' ? await local.fetchUsQuotes(symbols) : market === 'HK' ? await local.fetchHkQuotes(symbols) : await local.fetchKrQuotes(symbols);
    return fallback.map((quote) => ({ ...quote, priceSource: 'local', priceStatus: 'fallback' }));
  }
}

export const fetchAShareQuotes = (symbols: string[]) => quotes('A', symbols);
export const fetchUsQuotes = (symbols: string[]) => quotes('US', symbols);
export const fetchHkQuotes = (symbols: string[]) => quotes('HK', symbols);
export const fetchKrQuotes = (symbols: string[]) => quotes('KR', symbols);
