import { fetchPrices } from '@/lib/prices';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');

    if (!symbolsParam) {
      return Response.json({ prices: {} });
    }

    const symbols = symbolsParam.split(',').map((s) => s.trim().toUpperCase());
    const prices = await fetchPrices(symbols);

    return Response.json({ prices });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
