export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const base = process.env.MNAV_API_BASE?.trim();
    if (!base) {
      return Response.json(
        { error: { code: 'MISCONFIGURED', message: 'MNAV_API_BASE not set' } },
        { status: 500 }
      );
    }

    let url: string;
    try {
      url = new URL(`${base.replace(/\/$/, '')}/health`).toString();
    } catch (err) {
      console.error('[mnav-health] invalid MNAV_API_BASE:', base, err);
      return Response.json(
        { error: { code: 'MISCONFIGURED', message: `invalid MNAV_API_BASE: ${base}` } },
        { status: 500 }
      );
    }

    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    console.error('[mnav-health] proxy error:', err);
    return Response.json(
      {
        error: {
          code: 'PROXY_ERROR',
          message: err instanceof Error ? `${err.name}: ${err.message}` : 'unknown',
        },
      },
      { status: 502 }
    );
  }
}
