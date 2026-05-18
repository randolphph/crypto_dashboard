import 'server-only';
import type {
  StockPosition,
  StockMarket,
  StockCurrency,
  CashBalance,
  StockQuote,
} from '@/types/stocks';

const FLEX_BASE = 'https://gdcdyn.interactivebrokers.com/Universal/servlet';
const SEND_URL = `${FLEX_BASE}/FlexStatementService.SendRequest`;
const GET_URL = `${FLEX_BASE}/FlexStatementService.GetStatement`;

const POLL_MAX_MS = 8000;
const POLL_INTERVAL_MS = 1500;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface IbkrCreds {
  flexToken: string;
  flexQueryId: string;
}

export interface IbkrSnapshot {
  positions: StockPosition[];
  cash: CashBalance[];
  quotes: StockQuote[];
}

interface CacheEntry {
  data: IbkrSnapshot;
  ts: number;
}

// Per-warm-instance cache. Vercel cold starts will lose this, but within a
// warm function consecutive requests reuse the snapshot — critical since the
// Flex statement endpoint is rate-limited per query.
const cache = new Map<string, CacheEntry>();

export class IbkrError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function cacheKey(creds: IbkrCreds): string {
  return `${creds.flexToken}:${creds.flexQueryId}`;
}

function readAttrs(tagBody: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagBody)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function extractTagInner(xml: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

async function sendRequest(creds: IbkrCreds): Promise<string> {
  const url = `${SEND_URL}?t=${encodeURIComponent(creds.flexToken)}&q=${encodeURIComponent(creds.flexQueryId)}&v=3`;
  const res = await fetch(url, { cache: 'no-store' });
  const xml = await res.text();
  const status = extractTagInner(xml, 'Status');
  if (status !== 'Success') {
    const errMsg = extractTagInner(xml, 'ErrorMessage') ?? 'unknown error';
    const errCode = extractTagInner(xml, 'ErrorCode') ?? 'unknown';
    throw new IbkrError(errCode, `SendRequest failed: ${errMsg}`);
  }
  const ref = extractTagInner(xml, 'ReferenceCode');
  if (!ref) throw new IbkrError('NO_REF', 'SendRequest missing ReferenceCode');
  return ref;
}

async function getStatement(
  creds: IbkrCreds,
  referenceCode: string
): Promise<string> {
  const url = `${GET_URL}?t=${encodeURIComponent(creds.flexToken)}&q=${encodeURIComponent(referenceCode)}&v=3`;
  const start = Date.now();
  while (true) {
    const res = await fetch(url, { cache: 'no-store' });
    const xml = await res.text();
    // "Statement generation in progress" — IBKR returns status code 1019 in the
    // body wrapped in a FlexStatementResponse, NOT a 4xx HTTP status.
    if (/Statement generation in progress/i.test(xml) || /code>1019/.test(xml)) {
      if (Date.now() - start >= POLL_MAX_MS) {
        throw new IbkrError('PENDING', '报告生成中，请稍后再刷新');
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    // Any other ErrorMessage indicates a hard failure
    const errMsg = extractTagInner(xml, 'ErrorMessage');
    if (errMsg && !xml.includes('<FlexQueryResponse')) {
      const errCode = extractTagInner(xml, 'ErrorCode') ?? 'unknown';
      throw new IbkrError(errCode, errMsg);
    }
    return xml;
  }
}

function currencyToMarket(currency: string): StockMarket | null {
  const c = currency.toUpperCase();
  if (c === 'USD') return 'US';
  // CNH is the offshore-RMB counter on HKEX, so it's an HK listing — only
  // onshore CNY/RMB indicates an A-share.
  if (c === 'HKD' || c === 'CNH') return 'HK';
  if (c === 'CNY' || c === 'RMB') return 'A';
  return null;
}

function mapCurrency(c: string): StockCurrency | null {
  const u = c.toUpperCase();
  if (u === 'CNY' || u === 'CNH' || u === 'RMB') return 'CNY';
  if (u === 'HKD') return 'HKD';
  if (u === 'USD') return 'USD';
  return null;
}

export function parseFlexStatement(xml: string): IbkrSnapshot {
  const positions: StockPosition[] = [];
  const cash: CashBalance[] = [];
  const quotes: StockQuote[] = [];

  const posRe = /<OpenPosition\s+([^>]+?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = posRe.exec(xml)) !== null) {
    const attrs = readAttrs(m[1]);
    // IBKR's Flex Query UI labels these "AssetClass" and "Quantity"; the XML
    // historically emits `assetCategory` and `position`, but some account /
    // query variants use the UI names verbatim — accept both.
    const assetCat = (attrs.assetCategory ?? attrs.assetClass ?? '').toUpperCase();
    if (assetCat !== 'STK' && assetCat !== 'OPT') continue;
    const qty = parseFloat(attrs.position ?? attrs.quantity ?? '0');
    if (!Number.isFinite(qty) || qty === 0) continue;
    const market = currencyToMarket(attrs.currency ?? '');
    if (!market) continue;
    const currency = mapCurrency(attrs.currency ?? '');
    if (!currency) continue;
    const cost = parseFloat(attrs.costBasisPrice ?? '');
    const symbol = (attrs.symbol ?? '').trim();
    if (!symbol) continue;
    const description = attrs.description?.trim() || undefined;
    // IBKR's PnL attribute name varies by Flex Query version. Accept the
    // common variants — both the FIFO-specific one and the generic.
    const pnlRaw =
      attrs.fifoPnlUnrealized ??
      attrs.fifoPnLUnrealized ??
      attrs.unrealizedPnl ??
      attrs.unrealizedPnL ??
      attrs.mtmPnl;
    const apiPnl = pnlRaw !== undefined ? parseFloat(pnlRaw) : NaN;
    const multiplierRaw = parseFloat(attrs.multiplier ?? '1');
    const multiplier =
      Number.isFinite(multiplierRaw) && multiplierRaw > 0 ? multiplierRaw : 1;
    const kind: 'stock' | 'option' = assetCat === 'OPT' ? 'option' : 'stock';
    positions.push({
      // Include strike/expiry/putCall in the id so multiple options on the
      // same underlying don't collide.
      id: `ibkr:pos:${symbol}:${attrs.strike ?? ''}:${attrs.expiry ?? ''}:${attrs.putCall ?? ''}:${attrs.currency}`,
      broker: 'ibkr',
      market,
      symbol,
      name: description,
      shares: qty,
      costBasis: Number.isFinite(cost) && cost > 0 ? cost : undefined,
      apiPnl: Number.isFinite(apiPnl) ? apiPnl : undefined,
      multiplier: multiplier !== 1 ? multiplier : undefined,
      kind,
    });

    // IBKR's markPrice is the broker's authoritative price and covers OTC /
    // foreign tickers our free quote sources miss. Fall back to derived
    // (positionValue / position) when markPrice isn't included in the query.
    let mark = parseFloat(attrs.markPrice ?? '');
    if (!Number.isFinite(mark) || mark <= 0) {
      const pv = parseFloat(attrs.positionValue ?? '');
      if (Number.isFinite(pv) && pv !== 0 && qty !== 0) {
        mark = pv / qty;
      }
    }
    if (Number.isFinite(mark) && mark > 0) {
      quotes.push({
        symbol,
        market,
        price: mark,
        currency,
        name: description,
      });
    }
  }

  // Cash report rows usually appear as <CashReportCurrency .../>. Some Flex
  // configurations emit a wrapper currency='BASE_SUMMARY' aggregate row — skip
  // it so we don't double-count.
  const cashRe = /<CashReportCurrency\s+([^>]+?)\/>/g;
  while ((m = cashRe.exec(xml)) !== null) {
    const attrs = readAttrs(m[1]);
    const ccyRaw = attrs.currency ?? '';
    if (ccyRaw.toUpperCase() === 'BASE_SUMMARY') continue;
    const currency = mapCurrency(ccyRaw);
    if (!currency) continue;
    const amount = parseFloat(attrs.endingCash ?? '');
    if (!Number.isFinite(amount) || amount === 0) continue;
    cash.push({
      id: `ibkr:cash:${currency}`,
      broker: 'ibkr',
      currency,
      amount,
    });
  }

  return { positions, cash, quotes };
}

export async function fetchIbkrSnapshot(
  creds: IbkrCreds
): Promise<IbkrSnapshot> {
  const key = cacheKey(creds);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const ref = await sendRequest(creds);
    const xml = await getStatement(creds, ref);
    const data = parseFlexStatement(xml);
    cache.set(key, { data, ts: Date.now() });
    return data;
  } catch (e) {
    // Fall back to last good cache rather than failing the whole route.
    if (cached) return cached.data;
    throw e;
  }
}
