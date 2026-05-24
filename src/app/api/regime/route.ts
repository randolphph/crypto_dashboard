import { redis } from '@/lib/cache/upstash';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'regime:current';
const CACHE_TTL_S = 60 * 60;          // 1h — these signals barely move intraday

export type RegimeLabel =
  | 'bear-bottom'
  | 'accumulation'
  | 'bull-run'
  | 'euphoria';

interface RegimeData {
  ts: number;
  regime: RegimeLabel;
  mayer: number;
  fearGreed: number;
  fearGreedLabel: string;
  btcDominance: number;
  btcPrice: number;
  btc200dMa: number;
  cached?: boolean;
  errors?: string[];
}

// Regime gate — first match wins. Tuned for crypto cycles per the user's
// quoted heuristics: Mayer Multiple bands + Fear & Greed extremes.
function determineRegime(mayer: number, fg: number): RegimeLabel {
  if (mayer > 2.4 || fg > 85) return 'euphoria';
  if (mayer < 1 && fg < 30) return 'bear-bottom';
  if (mayer >= 1.5) return 'bull-run';
  return 'accumulation';
}

async function fetchMayer(): Promise<{ price: number; ma200: number } | null> {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200',
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { prices?: [number, number][] };
    const prices = data.prices?.map(([, p]) => p) ?? [];
    if (prices.length < 50) return null;
    const ma200 =
      prices.slice(-200).reduce((s, p) => s + p, 0) /
      Math.min(prices.length, 200);
    const price = prices[prices.length - 1];
    return { price, ma200 };
  } catch {
    return null;
  }
}

async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1&format=json', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { value: string; value_classification: string }[];
    };
    const row = data.data?.[0];
    if (!row) return null;
    const value = parseInt(row.value, 10);
    if (!Number.isFinite(value)) return null;
    return { value, label: row.value_classification };
  } catch {
    return null;
  }
}

async function fetchBtcDominance(): Promise<number | null> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { market_cap_percentage?: { btc?: number } };
    };
    const btc = data.data?.market_cap_percentage?.btc;
    return typeof btc === 'number' ? btc : null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Fast path: cached row from Upstash if fresh.
  if (redis) {
    try {
      const cached = await redis.get<RegimeData>(CACHE_KEY);
      if (cached) return Response.json({ ...cached, cached: true });
    } catch {
      // fall through to refresh
    }
  }

  const errors: string[] = [];
  const [mayer, fg, btcDom] = await Promise.all([
    fetchMayer(),
    fetchFearGreed(),
    fetchBtcDominance(),
  ]);

  if (!mayer) errors.push('mayer multiple unavailable (coingecko)');
  if (!fg) errors.push('fear & greed unavailable (alternative.me)');
  if (!btcDom) errors.push('btc dominance unavailable (coingecko)');

  if (!mayer || !fg) {
    return Response.json(
      { error: 'regime indicators unavailable', detail: errors.join('; ') },
      { status: 502 }
    );
  }

  const mayerMultiple = mayer.price / mayer.ma200;
  const regime = determineRegime(mayerMultiple, fg.value);
  const out: RegimeData = {
    ts: Date.now(),
    regime,
    mayer: mayerMultiple,
    fearGreed: fg.value,
    fearGreedLabel: fg.label,
    btcDominance: btcDom ?? 0,
    btcPrice: mayer.price,
    btc200dMa: mayer.ma200,
    errors: errors.length ? errors : undefined,
  };

  if (redis) {
    try {
      await redis.set(CACHE_KEY, out, { ex: CACHE_TTL_S });
    } catch {
      // best-effort
    }
  }

  return Response.json(out);
}
