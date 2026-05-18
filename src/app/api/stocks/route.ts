import {
  fetchAShareQuotes,
  fetchHkQuotes,
  fetchUsQuotes,
} from '@/lib/stocks/quotes';
import { fetchFx } from '@/lib/stocks/fx';
import {
  fetchLongportPositions,
  fetchLongportCash,
} from '@/lib/longport/positions';
import type { LongportCreds } from '@/lib/longport/sign';
import { fetchIbkrSnapshot, type IbkrCreds } from '@/lib/ibkr/flex';
import type {
  StockPosition,
  StockBroker,
  StockMarket,
  StockCurrency,
  EnrichedPosition,
  BrokerData,
  StockQuote,
  CashBalance,
  EnrichedCashBalance,
  FxRates,
  DataSource,
} from '@/types/stocks';

const BROKERS: StockBroker[] = ['ths', 'longport', 'ibkr'];

function quoteKey(market: StockMarket, symbol: string): string {
  return `${market}:${symbol.trim().toUpperCase()}`;
}

function emptyBrokers(): BrokerData[] {
  return BROKERS.map((b) => ({
    broker: b,
    positions: [],
    cash: [],
    positionsUsdValue: 0,
    cashUsdValue: 0,
    totalUsdValue: 0,
    totalPnlUsd: 0,
  }));
}

function fxRateFor(currency: StockCurrency, fx: FxRates): number {
  if (currency === 'CNY') return fx.cnyUsd;
  if (currency === 'HKD') return fx.hkdUsd;
  return 1;
}

function readLongportCreds(request: Request): LongportCreds | null {
  const appKey = request.headers.get('x-longport-app-key') || process.env.LONGPORT_APP_KEY;
  const appSecret = request.headers.get('x-longport-app-secret') || process.env.LONGPORT_APP_SECRET;
  const accessToken = request.headers.get('x-longport-access-token') || process.env.LONGPORT_ACCESS_TOKEN;
  if (!appKey || !appSecret || !accessToken) return null;
  return { appKey, appSecret, accessToken };
}

function readIbkrCreds(request: Request): IbkrCreds | null {
  const flexToken = request.headers.get('x-ibkr-flex-token') || process.env.IBKR_FLEX_TOKEN;
  const flexQueryId = request.headers.get('x-ibkr-flex-query-id') || process.env.IBKR_FLEX_QUERY_ID;
  if (!flexToken || !flexQueryId) return null;
  return { flexToken, flexQueryId };
}

export async function POST(request: Request) {
  let body: { positions?: StockPosition[]; cash?: CashBalance[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const manualPositions = Array.isArray(body.positions) ? body.positions : [];
  const manualCash = Array.isArray(body.cash) ? body.cash : [];
  const longportCreds = readLongportCreds(request);
  const ibkrCreds = readIbkrCreds(request);

  // Fetch broker API data in parallel; allSettled so a single broker failure
  // doesn't take down the route.
  const lpPositionsTask: Promise<StockPosition[]> = longportCreds
    ? fetchLongportPositions(longportCreds)
    : Promise.resolve([]);
  const lpCashTask: Promise<CashBalance[]> = longportCreds
    ? fetchLongportCash(longportCreds)
    : Promise.resolve([]);
  const ibkrTask: Promise<{
    positions: StockPosition[];
    cash: CashBalance[];
    quotes: StockQuote[];
  }> = ibkrCreds
    ? fetchIbkrSnapshot(ibkrCreds)
    : Promise.resolve({ positions: [], cash: [], quotes: [] });

  const [
    lpPositionsResult,
    lpCashResult,
    ibkrResult,
  ] = await Promise.allSettled([lpPositionsTask, lpCashTask, ibkrTask]);

  const lpPositions: StockPosition[] =
    lpPositionsResult.status === 'fulfilled' ? lpPositionsResult.value : [];
  const lpCash: CashBalance[] =
    lpCashResult.status === 'fulfilled' ? lpCashResult.value : [];
  const longportError: string | undefined =
    lpPositionsResult.status === 'rejected'
      ? (lpPositionsResult.reason instanceof Error
          ? lpPositionsResult.reason.message
          : String(lpPositionsResult.reason))
      : lpCashResult.status === 'rejected'
        ? (lpCashResult.reason instanceof Error
            ? lpCashResult.reason.message
            : String(lpCashResult.reason))
        : undefined;

  const ibkrPositions: StockPosition[] =
    ibkrResult.status === 'fulfilled' ? ibkrResult.value.positions : [];
  const ibkrCash: CashBalance[] =
    ibkrResult.status === 'fulfilled' ? ibkrResult.value.cash : [];
  const ibkrQuotes: StockQuote[] =
    ibkrResult.status === 'fulfilled' ? ibkrResult.value.quotes : [];
  const ibkrError: string | undefined =
    ibkrResult.status === 'rejected'
      ? (ibkrResult.reason instanceof Error
          ? ibkrResult.reason.message
          : String(ibkrResult.reason))
      : undefined;

  const taggedManualPositions = manualPositions.map((p) => ({ p, source: 'manual' as DataSource }));
  const taggedApiPositions = [
    ...lpPositions.map((p) => ({ p, source: 'api' as DataSource })),
    ...ibkrPositions.map((p) => ({ p, source: 'api' as DataSource })),
  ];
  const allPositions = [...taggedManualPositions, ...taggedApiPositions];

  const taggedManualCash = manualCash.map((c) => ({ c, source: 'manual' as DataSource }));
  const taggedApiCash = [
    ...lpCash.map((c) => ({ c, source: 'api' as DataSource })),
    ...ibkrCash.map((c) => ({ c, source: 'api' as DataSource })),
  ];
  const allCash = [...taggedManualCash, ...taggedApiCash];

  if (allPositions.length === 0 && allCash.length === 0) {
    const brokers = emptyBrokers().map((b) => {
      if (b.broker === 'longport' && longportCreds) return { ...b, apiError: longportError };
      if (b.broker === 'ibkr' && ibkrCreds) return { ...b, apiError: ibkrError };
      return b;
    });
    return Response.json({
      brokers,
      fx: { cnyUsd: 0, hkdUsd: 0 },
      lastUpdated: new Date().toISOString(),
    });
  }

  const uniq = (xs: string[]) => [...new Set(xs.map((s) => s.trim()))].filter(Boolean);
  const aSymbols = uniq(allPositions.filter(({ p }) => p.market === 'A').map(({ p }) => p.symbol));
  const hSymbols = uniq(allPositions.filter(({ p }) => p.market === 'HK').map(({ p }) => p.symbol));
  const uSymbols = uniq(allPositions.filter(({ p }) => p.market === 'US').map(({ p }) => p.symbol));

  const [aQuotes, hQuotes, uQuotes, fxResult] = await Promise.all([
    fetchAShareQuotes(aSymbols),
    fetchHkQuotes(hSymbols),
    fetchUsQuotes(uSymbols),
    fetchFx().catch((): null => null),
  ]);

  const fx = fxResult ?? { cnyUsd: 0, hkdUsd: 0 };
  const marketCurrency = (market: StockMarket): StockCurrency =>
    market === 'A' ? 'CNY' : market === 'HK' ? 'HKD' : 'USD';

  const quoteMap = new Map<string, StockQuote>();
  for (const q of [...aQuotes, ...hQuotes, ...uQuotes]) {
    quoteMap.set(quoteKey(q.market, q.symbol), q);
  }
  // IBKR's mark price is the broker's authoritative number and covers OTC /
  // foreign tickers Yahoo/Tencent miss — let it win when both sources have it.
  for (const q of ibkrQuotes) {
    quoteMap.set(quoteKey(q.market, q.symbol), q);
  }

  const enrichedCash: EnrichedCashBalance[] = allCash.map(({ c, source }) => ({
    ...c,
    amountUsd: c.amount * fxRateFor(c.currency, fx),
    source,
  }));

  const enriched: EnrichedPosition[] = allPositions.map(({ p, source }) => {
    const q = quoteMap.get(quoteKey(p.market, p.symbol));
    const price = q?.price ?? 0;
    const currency = q?.currency ?? marketCurrency(p.market);
    const mult = p.multiplier ?? 1;
    const marketValue = price * p.shares * mult;
    const rate = fxRateFor(currency, fx);
    const marketValueUsd = marketValue * rate;
    // Prefer broker-supplied PnL (handles FIFO basis, corporate actions, etc.)
    // and fall back to the simple `(price - cost) * shares * multiplier`
    // calculation when the broker didn't provide one.
    const pnl =
      p.apiPnl !== undefined
        ? p.apiPnl
        : p.costBasis !== undefined && p.costBasis !== null
          ? (price - p.costBasis) * p.shares * mult
          : undefined;
    const pnlUsd = pnl !== undefined ? pnl * rate : undefined;
    // Use |shares| in the denominator so the percentage's sign tracks the
    // PnL's sign for short positions (shorts have negative `shares`, which
    // would otherwise flip pct's sign relative to pnl).
    const pnlPct =
      pnl !== undefined &&
      p.costBasis !== undefined &&
      p.costBasis > 0 &&
      p.shares !== 0
        ? (pnl / (p.costBasis * Math.abs(p.shares) * mult)) * 100
        : undefined;
    return {
      ...p,
      price,
      currency,
      marketValue,
      marketValueUsd,
      pnl,
      pnlUsd,
      pnlPct,
      changePct: q?.changePct,
      quoteName: q?.name,
      quoteError: q?.error,
      source,
    };
  });

  const brokers: BrokerData[] = BROKERS.map((broker) => {
    const items = enriched.filter((p) => p.broker === broker);
    const cashItems = enrichedCash.filter((c) => c.broker === broker);
    const positionsUsdValue = items.reduce((s, p) => s + p.marketValueUsd, 0);
    const cashUsdValue = cashItems.reduce((s, c) => s + c.amountUsd, 0);
    return {
      broker,
      positions: items,
      cash: cashItems,
      positionsUsdValue,
      cashUsdValue,
      totalUsdValue: positionsUsdValue + cashUsdValue,
      totalPnlUsd: items.reduce((s, p) => s + (p.pnlUsd ?? 0), 0),
      apiError:
        broker === 'longport' && longportCreds
          ? longportError
          : broker === 'ibkr' && ibkrCreds
            ? ibkrError
            : undefined,
    };
  });

  return Response.json({
    brokers,
    fx,
    lastUpdated: new Date().toISOString(),
  });
}
