import { fetchWithTimeout } from '@/lib/http/fetch';
import { enforceRateLimit } from '@/lib/http/guards';

export const dynamic = 'force-dynamic';
export const maxDuration = 12;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'snapshot:health', 60, 60);
  if (limited) return limited;

  const base = process.env.MNAV_API_BASE?.trim();
  if (!base) {
    return Response.json(
      { ok: false, error: 'MNAV_API_BASE not set' },
      { status: 500 }
    );
  }

  let upstream: URL;
  try {
    upstream = new URL(`${base.replace(/\/$/, '')}/snapshot/health`);
  } catch {
    return Response.json(
      { ok: false, error: `invalid MNAV_API_BASE: ${base}` },
      { status: 500 }
    );
  }
  // Pass through optional `wallet` param so backend can report per-wallet count.
  const incoming = new URL(request.url);
  const wallet = incoming.searchParams.get('wallet');
  if (wallet) upstream.searchParams.set('wallet', wallet);

  try {
    // No bearer — backend exposes /snapshot/health unauthenticated by spec.
    const res = await fetchWithTimeout(upstream, { cache: 'no-store' });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : 'unknown',
      },
      { status: 502 }
    );
  }
}
