import {
  fetchAShareQuotes,
  fetchHkQuotes,
  fetchUsQuotes,
} from '@/lib/stocks/quotes';
import { fetchFx } from '@/lib/stocks/fx';
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

export async function POST(request: Request) {
  let body: { positions?: StockPosition[]; cash?: CashBalance[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const positions = Array.isArray(body.positions) ? body.positions : [];
  const cashEntries = Array.isArray(body.cash) ? body.cash : [];

  if (positions.length === 0 && cashEntries.length === 0) {
    return Response.json({
      brokers: emptyBrokers(),
      fx: { cnyUsd: 0, hkdUsd: 0 },
      lastUpdated: new Date().toISOString(),
    });
  }

  const uniq = (xs: string[]) => [...new Set(xs.map((s) => s.trim()))].filter(Boolean);
  const aSymbols = uniq(positions.filter((p) => p.market === 'A').map((p) => p.symbol));
  const hSymbols = uniq(positions.filter((p) => p.market === 'HK').map((p) => p.symbol));
  const uSymbols = uniq(positions.filter((p) => p.market === 'US').map((p) => p.symbol));

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

  const enrichedCash: EnrichedCashBalance[] = cashEntries.map((c) => ({
    ...c,
    amountUsd: c.amount * fxRateFor(c.currency, fx),
  }));

  const enriched: EnrichedPosition[] = positions.map((p) => {
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
    };
  });

  return Response.json({
    brokers,
    fx,
    lastUpdated: new Date().toISOString(),
  });
}
