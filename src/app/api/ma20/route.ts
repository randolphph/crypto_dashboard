import { fetchMa20, type MaSymbol } from '@/lib/stocks/ma';
import type { StockMarket } from '@/types/stocks';

export const dynamic = 'force-dynamic';

function isMaSymbol(x: unknown): x is MaSymbol {
  if (!x || typeof x !== 'object') return false;
  const w = x as Record<string, unknown>;
  const m = w.market as StockMarket;
  return (
    (m === 'A' || m === 'HK' || m === 'US' || m === 'KR') &&
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
    ? body.symbols.filter(isMaSymbol)
    : [];

  if (symbols.length === 0) {
    return Response.json({ ma20: {} });
  }

  const ma20 = await fetchMa20(symbols);
  return Response.json({ ma20, lastUpdated: new Date().toISOString() });
}
