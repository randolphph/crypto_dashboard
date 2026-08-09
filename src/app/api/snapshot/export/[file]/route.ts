import { fetchWithTimeout } from '@/lib/http/fetch';
import { enforceRateLimit } from '@/lib/http/guards';

export const dynamic = 'force-dynamic';
export const maxDuration = 35;

const ALLOWED = new Set([
  'positions.csv',
  'portfolio.csv',
  'full.json',
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const limited = await enforceRateLimit(request, 'snapshot:export', 30, 60 * 60);
  if (limited) return limited;

  const { file } = await params;
  if (!ALLOWED.has(file)) {
    return Response.json({ error: 'unknown export file' }, { status: 404 });
  }

  const base = process.env.MNAV_API_BASE?.trim();
  const token = process.env.MNAV_API_TOKEN?.trim();
  if (!base || !token) {
    return Response.json(
      { error: 'MNAV_API_BASE or MNAV_API_TOKEN not set' },
      { status: 500 }
    );
  }

  let upstream: URL;
  try {
    upstream = new URL(`${base.replace(/\/$/, '')}/export/${file}`);
  } catch (err) {
    console.error('[export] invalid MNAV_API_BASE:', base, err);
    return Response.json(
      { error: `invalid MNAV_API_BASE: ${base}` },
      { status: 500 }
    );
  }
  // Pass through filter params (wallet, from, to, symbol, source).
  const incoming = new URL(request.url);
  for (const k of ['wallet', 'from', 'to', 'symbol', 'source']) {
    const v = incoming.searchParams.get(k);
    if (v) upstream.searchParams.set(k, v);
  }

  try {
    const res = await fetchWithTimeout(upstream, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }, 30_000);
    const headers = new Headers();
    headers.set('Cache-Control', 'private, no-store');
    const ct = res.headers.get('content-type');
    if (ct) headers.set('Content-Type', ct);
    const cd = res.headers.get('content-disposition');
    if (cd) headers.set('Content-Disposition', cd);
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    console.error('[export] proxy error:', err);
    return Response.json(
      {
        error: err instanceof Error ? `${err.name}: ${err.message}` : 'unknown',
      },
      { status: 502 }
    );
  }
}
