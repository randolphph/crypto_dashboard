import { fetchFx } from '@/lib/stocks/fx';
import { enforceRateLimit } from '@/lib/http/guards';

export const maxDuration = 10;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'fx', 60, 60);
  if (limited) return limited;

  try {
    const fx = await fetchFx();
    return Response.json({
      ...fx,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      {
        cnyUsd: 0,
        hkdUsd: 0,
        krwUsd: 0,
        error: e instanceof Error ? e.message : 'fx unavailable',
        lastUpdated: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
