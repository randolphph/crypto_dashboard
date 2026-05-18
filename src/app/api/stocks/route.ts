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

  // Fetch LongPort API data in parallel with FX; capture errors so partial
  // failures don't take down the entire response.
  const lpPositionsTask: Promise<StockPosition[]> = longportCreds
    ? fetchLongportPositions(longportCreds)
    : Promise.resolve([]);
  const lpCashTask: Promise<CashBalance[]> = longportCreds
    ? fetchLongportCash(longportCreds)
    : Promise.resolve([]);

  const [
    lpPositionsResult,
    lpCashResult,
  ] = await Promise.allSettled([lpPositionsTask, lpCashTask]);

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

  const taggedManualPositions = manualPositions.map((p) => ({ p, source: 'manual' as DataSource }));
  const taggedApiPositions = lpPositions.map((p) => ({ p, source: 'api' as DataSource }));
  const allPositions = [...taggedManualPositions, ...taggedApiPositions];

  const taggedManualCash = manualCash.map((c) => ({ c, source: 'manual' as DataSource }));
  const taggedApiCash = lpCash.map((c) => ({ c, source: 'api' as DataSource }));
  const allCash = [...taggedManualCash, ...taggedApiCash];

  if (allPositions.length === 0 && allCash.length === 0) {
    const brokers = emptyBrokers().map((b) =>
      b.broker === 'longport' && longportCreds
        ? { ...b, apiError: longportError }
        : b
    );
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

  const enrichedCash: EnrichedCashBalance[] = allCash.map(({ c, source }) => ({
    ...c,
    amountUsd: c.amount * fxRateFor(c.currency, fx),
    source,
  }));

  const enriched: EnrichedPosition[] = allPositions.map(({ p, source }) => {
    const q = quoteMap.get(quoteKey(p.market, p.symbol));
    const price = q?.price ?? 0;
    const currency = q?.currency ?? marketCurrency(p.market);
    const marketValue = price * p.shares;
    const rate = fxRateFor(currency, fx);
    const marketValueUsd = marketValue * rate;
    const pnl =
      p.costBasis !== undefined && p.costBasis !== null
        ? (price - p.costBasis) * p.shares
        : undefined;
    const pnlUsd = pnl !== undefined ? pnl * rate : undefined;
    const pnlPct =
      p.costBasis !== undefined && p.costBasis > 0
        ? ((price - p.costBasis) / p.costBasis) * 100
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
      apiError: broker === 'longport' && longportCreds ? longportError : undefined,
    };
  });

  return Response.json({
    brokers,
    fx,
    lastUpdated: new Date().toISOString(),
  });
}
