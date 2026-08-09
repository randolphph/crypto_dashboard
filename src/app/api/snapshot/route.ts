import { fetchWithTimeout } from '@/lib/http/fetch';
import {
  enforceRateLimit,
  inputErrorResponse,
  readJsonBody,
} from '@/lib/http/guards';

export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'snapshot:write', 24, 60 * 60);
  if (limited) return limited;

  const base = process.env.MNAV_API_BASE?.trim();
  const token = process.env.MNAV_API_TOKEN?.trim();
  if (!base || !token) {
    return Response.json(
      { ok: false, error: 'MNAV_API_BASE or MNAV_API_TOKEN not set' },
      { status: 500 }
    );
  }

  let upstream: URL;
  try {
    upstream = new URL(`${base.replace(/\/$/, '')}/snapshot`);
  } catch (err) {
    console.error('[snapshot] invalid MNAV_API_BASE:', base, err);
    return Response.json(
      { ok: false, error: `invalid MNAV_API_BASE: ${base}` },
      { status: 500 }
    );
  }

  let body: string;
  try {
    const parsed = await readJsonBody(request, 1024 * 1024);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return Response.json({ ok: false, error: 'snapshot must be an object' }, { status: 400 });
    }
    body = JSON.stringify(parsed);
  } catch (error) {
    return inputErrorResponse(error);
  }

  try {
    const res = await fetchWithTimeout(upstream, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      cache: 'no-store',
    }, 20_000);
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[snapshot] proxy error:', err);
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : 'unknown',
      },
      { status: 502 }
    );
  }
}
