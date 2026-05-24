export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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
    body = await request.text();
  } catch {
    return Response.json({ ok: false, error: 'invalid request body' }, { status: 400 });
  }

  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      cache: 'no-store',
    });
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
