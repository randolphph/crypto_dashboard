import type { StockMarket } from '@/types/stocks';
import { fetchWithTimeout } from '@/lib/http/fetch';

const LOGO_BASE = 'https://financialmodelingprep.com/image-stock';
const LOGO_REVALIDATE_SECONDS = 30 * 24 * 60 * 60;
const VALID_MARKETS = new Set<StockMarket>(['A', 'HK', 'US', 'KR']);

function logoSymbols(market: StockMarket, symbol: string): string[] {
  const raw = symbol.trim().toUpperCase();
  const digits = raw.replace(/\D/g, '');

  switch (market) {
    case 'US': {
      const plain = raw.replace(/\.US$/, '');
      const dashed = plain.replace('.', '-');
      return dashed === plain ? [plain] : [dashed, plain];
    }
    case 'HK':
      return digits ? [`${digits.padStart(4, '0')}.HK`] : [];
    case 'A': {
      if (!digits) return [];
      const suffix = digits.startsWith('6')
        ? 'SS'
        : /^(4|8|92)/.test(digits)
          ? 'BJ'
          : 'SZ';
      return [`${digits}.${suffix}`];
    }
    case 'KR':
      return digits
        ? [`${digits.padStart(6, '0')}.KS`, `${digits.padStart(6, '0')}.KQ`]
        : [];
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ market: string; symbol: string }> }
) {
  const { market, symbol } = await params;
  if (
    !VALID_MARKETS.has(market as StockMarket) ||
    !symbol ||
    symbol.length > 32
  ) {
    return new Response(null, { status: 404 });
  }

  for (const logoSymbol of logoSymbols(market as StockMarket, symbol)) {
    try {
      const upstream = await fetchWithTimeout(
        `${LOGO_BASE}/${encodeURIComponent(logoSymbol)}.png`,
        { next: { revalidate: LOGO_REVALIDATE_SECONDS } }
      );
      const contentType = upstream.headers.get('content-type');
      if (!upstream.ok || !contentType?.startsWith('image/')) continue;

      return new Response(await upstream.arrayBuffer(), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control':
            'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000',
        },
      });
    } catch {
      continue;
    }
  }

  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': 'public, max-age=86400' },
  });
}
