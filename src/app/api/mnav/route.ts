import { MNAV_INTERVALS, type MnavInterval } from '@/types/mnav';

const ALLOWED = new Set<MnavInterval>(MNAV_INTERVALS);

export const revalidate = 300;

export async function GET(request: Request) {
  const base = process.env.MNAV_API_BASE;
  const token = process.env.MNAV_API_TOKEN;
  if (!base || !token) {
    return Response.json(
      { error: { code: 'MISCONFIGURED', message: 'MNAV_API_BASE or MNAV_API_TOKEN not set' } },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const interval = searchParams.get('interval') ?? '1d';
  if (!ALLOWED.has(interval as MnavInterval)) {
    return Response.json(
      { error: { code: 'INVALID_INTERVAL', message: `interval must be one of ${MNAV_INTERVALS.join(',')}` } },
      { status: 400 }
    );
  }

  const upstream = new URL(`${base.replace(/\/$/, '')}/mstr/mnav`);
  upstream.searchParams.set('interval', interval);
  for (const k of ['from', 'to']) {
    const v = searchParams.get(k);
    if (v) upstream.searchParams.set(k, v);
  }

  try {
    const res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    return Response.json(
      { error: { code: 'UPSTREAM_UNREACHABLE', message: err instanceof Error ? err.message : 'unknown' } },
      { status: 502 }
    );
  }
}
