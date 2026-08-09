import { fetchMa20, type MaSymbol } from '@/lib/stocks/ma';
import {
  enforceRateLimit,
  inputErrorResponse,
  readJsonBody,
} from '@/lib/http/guards';
import { parseMarketSymbols } from '@/lib/http/validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'ma20', 12, 60);
  if (limited) return limited;

  let symbols: MaSymbol[];
  try {
    const body = (await readJsonBody(request)) as { symbols?: unknown };
    symbols = parseMarketSymbols(body?.symbols, 30);
  } catch (error) {
    return inputErrorResponse(error);
  }

  if (symbols.length === 0) {
    return Response.json({ ma20: {} });
  }

  const ma20 = await fetchMa20(symbols);
  return Response.json({ ma20, lastUpdated: new Date().toISOString() });
}
