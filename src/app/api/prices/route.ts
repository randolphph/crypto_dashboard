import { fetchPrices } from '@/lib/prices';
import { enforceRateLimit } from '@/lib/http/guards';

export const maxDuration = 15;
const MAX_SYMBOLS = 50;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'prices', 60, 60);
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
      return Response.json({ prices: {} });
    }

    const rawSymbols = symbolsParam.split(',');
    if (rawSymbols.length > MAX_SYMBOLS) {
      return Response.json(
        { error: `too many symbols (max ${MAX_SYMBOLS})` },
        { status: 413 }
      );
    }
    const symbols = [...new Set(rawSymbols.map((s) => s.trim().toUpperCase()))];
    if (symbols.some((s) => !s || s.length > 24 || /[^A-Z0-9._-]/.test(s))) {
      return Response.json({ error: 'invalid symbol' }, { status: 400 });
    }
    const prices = await fetchPrices(symbols);

    return Response.json({ prices });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
