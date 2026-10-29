import { fetchWithTimeout } from '@/lib/http/fetch';
import { SYMBOL_TO_COINGECKO } from '@/lib/prices';

const REVALIDATE_SECONDS = 30 * 24 * 60 * 60;
const ICON_IDS: Record<string, string> = {
  ...SYMBOL_TO_COINGECKO,
  DAI: 'dai', FDUSD: 'first-digital-usd', TUSD: 'true-usd',
  PYUSD: 'paypal-usd', USDP: 'paxos-standard', POL: 'polygon-ecosystem-token',
};
const notFound = () => new Response(null, {
  status: 404,
  headers: { 'Cache-Control': 'public, max-age=86400' },
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const raw = symbol.replace(/\([^)]+\)$/, '').trim().toUpperCase();
  const normalized = raw.startsWith('LD') && ICON_IDS[raw.slice(2)] ? raw.slice(2) : raw;
  const id = Object.hasOwn(ICON_IDS, normalized) ? ICON_IDS[normalized] : undefined;
  if (symbol.length > 64 || !id) return notFound();

  try {
    // Reuse the price provider's unambiguous coin IDs; no ticker search or RPC.
    const metadata = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
      { next: { revalidate: REVALIDATE_SECONDS } }, 4000
    );
    if (!metadata.ok) return notFound();
    const data = await metadata.json() as { image?: { small?: string; thumb?: string } };
    const src = data.image?.small ?? data.image?.thumb;
    if (!src) return notFound();
    const url = new URL(src);
    if (url.protocol !== 'https:' || !['coin-images.coingecko.com', 'assets.coingecko.com'].includes(url.hostname)) return notFound();
    const image = await fetchWithTimeout(url, { next: { revalidate: REVALIDATE_SECONDS } }, 4000);
    const contentType = image.headers.get('content-type');
    if (!image.ok || !contentType?.startsWith('image/')) return notFound();
    return new Response(await image.arrayBuffer(), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000',
      },
    });
  } catch {
    return notFound();
  }
}
