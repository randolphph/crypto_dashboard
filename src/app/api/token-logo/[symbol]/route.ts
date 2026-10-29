import { fetchWithTimeout } from '@/lib/http/fetch';
import { SYMBOL_TO_COINGECKO } from '@/lib/prices';
import { bundledTokenIconUrl } from '@/lib/portfolio/tokenIcons';

const REVALIDATE_SECONDS = 30 * 24 * 60 * 60;
const ICON_IDS: Record<string, string> = {
  ...SYMBOL_TO_COINGECKO,
  DAI: 'dai', FDUSD: 'first-digital-usd', TUSD: 'true-usd',
  PYUSD: 'paypal-usd', USDP: 'paxos-standard', POL: 'polygon-ecosystem-token',
  // Exact IDs verified against the provider's coin list. Keep icon coverage
  // independent of the smaller price fallback list; never guess by ticker search.
  ENA: 'ethena', SUI: 'sui', TRX: 'tron', LTC: 'litecoin',
  BCH: 'bitcoin-cash', ETC: 'ethereum-classic', NEAR: 'near',
  SHIB: 'shiba-inu', PEPE: 'pepe', HYPE: 'hyperliquid',
  USDE: 'ethena-usde', STETH: 'staked-ether', WSTETH: 'wrapped-steth',
  EIGEN: 'eigenlayer', PENDLE: 'pendle', TIA: 'celestia', ONDO: 'ondo-finance',
  WLD: 'worldcoin-wld', APT: 'aptos', SEI: 'sei-network', RENDER: 'render-token',
  INJ: 'injective-protocol', FET: 'fetch-ai', TAO: 'bittensor',
  FIL: 'filecoin', ICP: 'internet-computer', JUP: 'jupiter-exchange-solana',
  JTO: 'jito-governance-token', CAKE: 'pancakeswap-token',
  BUSD: 'binance-usd', USD1: 'usd1-wlfi', USD0: 'usual-usd',
};
const notFound = () => new Response(null, {
  status: 404,
  headers: { 'Cache-Control': 'public, max-age=300' },
});
const unavailable = () => new Response(null, {
  status: 503,
  headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  // Older clients can keep using the proxy URL without metadata API requests.
  const bundled = bundledTokenIconUrl(symbol);
  if (bundled) return new Response(null, {
    status: 307,
    headers: {
      Location: bundled,
      'Cache-Control': 'public, max-age=604800, s-maxage=2592000',
    },
  });
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
    if (!metadata.ok) return metadata.status === 404 ? notFound() : unavailable();
    const data = await metadata.json() as { image?: { large?: string; small?: string; thumb?: string } };
    // Keep table icons lightweight; the tree's separate URL also bypasses any
    // previously cached 50px response when requesting the high-resolution image.
    const large = new URL(request.url).searchParams.get('size') === 'large';
    const src = (large ? data.image?.large : undefined) ?? data.image?.small ?? data.image?.thumb;
    if (!src) return notFound();
    const url = new URL(src);
    if (url.protocol !== 'https:' || !['coin-images.coingecko.com', 'assets.coingecko.com'].includes(url.hostname)) return notFound();
    const image = await fetchWithTimeout(url, { next: { revalidate: REVALIDATE_SECONDS } }, 4000);
    const contentType = image.headers.get('content-type');
    if (!image.ok) return image.status === 404 ? notFound() : unavailable();
    if (!contentType?.startsWith('image/')) return unavailable();
    return new Response(await image.arrayBuffer(), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000',
      },
    });
  } catch {
    return unavailable();
  }
}
