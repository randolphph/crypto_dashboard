import { fetchFx } from '@/lib/stocks/fx';

export async function GET() {
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
      { status: 200 }
    );
  }
}
