import 'server-only';
import type { StockMarket } from '@/types/stocks';

// 20-day simple moving average from Yahoo daily closes. Used by the加仓 plan so
// anchor prices hang off a REAL MA20 instead of a hand-typed (often stale)
// number. Yahoo covers every market via a suffix; US is exact, A/HK/KR are
// best-effort and fall back to the plan's manual ma20 when they miss.

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

const MA_WINDOW = 20;
// MA20 barely moves intraday; cache an hour so repeated dashboard refreshes
// don't hammer Yahoo with one request per symbol each time.
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { value: number; ts: number }>();

export function ma20Key(market: StockMarket, symbol: string): string {
  return `${market}:${symbol.trim().toUpperCase()}`;
}

// Candidate Yahoo tickers to try in order (KR has two listings; A-share suffix
// is inferred from the leading digit: 6xxxxx = Shanghai, else Shenzhen).
function yahooCandidates(market: StockMarket, symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  switch (market) {
    case 'US':
      return [s];
    case 'KR':
      return [`${s}.KS`, `${s}.KQ`];
    case 'HK':
      return [`${s.replace(/\D/g, '').padStart(4, '0')}.HK`];
    case 'A':
      return [`${s}.${s.startsWith('6') ? 'SS' : 'SZ'}`];
    default:
      return [s];
  }
}

function ma20FromCloses(closes: number[]): number | null {
  // Require a full window so we report a true MA20, not a partial average —
  // newly-listed names fall back to the plan's manual value instead.
  if (closes.length < MA_WINDOW) return null;
  const window = closes.slice(-MA_WINDOW);
  const avg = window.reduce((a, b) => a + b, 0) / window.length;
  return Number.isFinite(avg) && avg > 0 ? avg : null;
}

async function ma20ForYahoo(yahooSymbol: string): Promise<number | null> {
  const ck = `y:${yahooSymbol}`;
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?interval=1d&range=3mo`;
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.chart?.error) return null;
    const closes: unknown =
      data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes)) return null;
    const valid = closes.filter(
      (c): c is number => typeof c === 'number' && Number.isFinite(c)
    );
    const ma = ma20FromCloses(valid);
    if (ma !== null) cache.set(ck, { value: ma, ts: Date.now() });
    return ma;
  } catch {
    return null;
  }
}

// stooq daily-history fallback — mirrors the app's existing US quote fallback
// (Yahoo → stooq), which matters because Yahoo Finance is often blocked from
// the home-server's network while stooq stays reachable. CSV: Date,Open,High,
// Low,Close,Volume.
async function ma20FromStooq(stooqCode: string): Promise<number | null> {
  const ck = `s:${stooqCode}`;
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqCode)}&i=d`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    // Anti-bot challenge / error pages are HTML, not CSV.
    if (text.includes('<') || !/^Date,/i.test(text.trim())) return null;
    const closes = text
      .trim()
      .split('\n')
      .slice(1)
      .map((l) => parseFloat(l.split(',')[4]))
      .filter((n) => Number.isFinite(n));
    const ma = ma20FromCloses(closes);
    if (ma !== null) cache.set(ck, { value: ma, ts: Date.now() });
    return ma;
  } catch {
    return null;
  }
}

// Tencent (qt.gtimg.cn / ifzq.gtimg.cn) is reachable from a China-hosted box
// where Yahoo is blocked. Used for A/HK only — the exchange prefix (sh/sz/hk)
// is deterministic from the code, so there's no wrong-listing ambiguity.
// (US is NOT done via Tencent: its .OQ/.N suffix is a guess, and Tencent
// happily serves a full series of CORRUPT adjusted prices for the wrong
// exchange — e.g. usCOHR.OQ returns 41 bars averaging 61 instead of 387.)
// Mirrors aShareCode / hkCode in lib/stocks/quotes.ts.
function tencentCandidates(market: StockMarket, symbol: string): string[] {
  const s = symbol.replace(/^(sh|sz|bj|hk)/i, '').trim();
  if (market === 'A') {
    if (/^(60|68|9|5)/.test(s)) return [`sh${s}`];
    if (/^(00|30|20|15|16|18)/.test(s)) return [`sz${s}`];
    if (/^(43|83|87|88|92)/.test(s)) return [`bj${s}`];
    if (/^[68]/.test(s)) return [`sh${s}`];
    return [`sz${s}`];
  }
  if (market === 'HK') return [`hk${s.padStart(5, '0')}`];
  return [];
}

// Eastmoney (push2his.eastmoney.com) — China-reachable and, unlike Tencent,
// returns EMPTY for the wrong US market code instead of corrupt data, so the
// exchange can be disambiguated by trying each. 105 = NASDAQ, 106 = NYSE,
// 107 = AMEX. klines are "date,close" strings (f51,f53).
function eastmoneyUsSecids(symbol: string): string[] {
  const u = symbol.replace(/^us/i, '').trim().toUpperCase();
  return [`105.${u}`, `106.${u}`, `107.${u}`];
}

async function ma20FromEastmoney(secid: string): Promise<number | null> {
  const ck = `e:${secid}`;
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&lmt=40&end=20500101&fields1=f1,f2&fields2=f51,f53`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const klines: unknown = json?.data?.klines;
    if (!Array.isArray(klines)) return null;
    const closes = klines
      .map((x) => parseFloat(String(x).split(',')[1]))
      .filter((n) => Number.isFinite(n));
    const ma = ma20FromCloses(closes);
    if (ma !== null) cache.set(ck, { value: ma, ts: Date.now() });
    return ma;
  } catch {
    return null;
  }
}

// Tencent daily K-line: data[code].qfqday rows are [date, open, close, ...].
async function ma20FromTencent(code: string): Promise<number | null> {
  const ck = `t:${code}`;
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,40,qfq`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const node = json?.data?.[code];
    const kl: unknown = node?.qfqday ?? node?.day;
    if (!Array.isArray(kl)) return null;
    const closes = kl
      .map((row) => parseFloat((row as string[])?.[2]))
      .filter((n) => Number.isFinite(n));
    const ma = ma20FromCloses(closes);
    if (ma !== null) cache.set(ck, { value: ma, ts: Date.now() });
    return ma;
  } catch {
    return null;
  }
}

// Naver daily K-line for KRX names — China-reachable, unlike Yahoo. Rows come
// ascending by date as { localDate, closePrice, ... }; closePrice is numeric.
async function ma20FromNaver(code: string): Promise<number | null> {
  const ck = `n:${code}`;
  const cached = cache.get(ck);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`;
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 24 * 60 * 60 * 1000);
  const url = `https://api.stock.naver.com/chart/domestic/item/${code}/day?startDateTime=${fmt(
    start
  )}&endDateTime=${fmt(end)}`;
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const rows: unknown = Array.isArray(json) ? json : json?.priceInfos;
    if (!Array.isArray(rows)) return null;
    const closes = rows
      .map((r) => Number((r as { closePrice?: unknown })?.closePrice))
      .filter((n) => Number.isFinite(n) && n > 0);
    const ma = ma20FromCloses(closes);
    if (ma !== null) cache.set(ck, { value: ma, ts: Date.now() });
    return ma;
  } catch {
    return null;
  }
}

export interface MaSymbol {
  market: StockMarket;
  symbol: string;
}

// Returns { "US:MRVL": 267.1, ... } — only entries we could compute. Missing
// keys signal the caller to keep the manual ma20.
export async function fetchMa20(
  items: MaSymbol[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  await Promise.all(
    items.map(async ({ market, symbol }) => {
      const set = (ma: number | null): boolean => {
        if (ma === null) return false;
        out[ma20Key(market, symbol)] = ma;
        return true;
      };

      // Yahoo first (accurate, works off-China). Then China-reachable fallbacks
      // for when Yahoo is blocked: Tencent for A/HK, Naver for KR, Eastmoney for
      // US (tries each exchange; wrong one returns empty), stooq as a final US
      // backstop.
      for (const cand of yahooCandidates(market, symbol)) {
        if (set(await ma20ForYahoo(cand))) return;
      }
      for (const tc of tencentCandidates(market, symbol)) {
        if (set(await ma20FromTencent(tc))) return;
      }
      if (market === 'KR') {
        if (set(await ma20FromNaver(symbol.replace(/\D/g, '')))) return;
      }
      if (market === 'US') {
        for (const secid of eastmoneyUsSecids(symbol)) {
          if (set(await ma20FromEastmoney(secid))) return;
        }
        set(await ma20FromStooq(`${symbol.trim().toLowerCase()}.us`));
      }
    })
  );
  return out;
}
