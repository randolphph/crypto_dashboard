export const revalidate = 60;

export async function GET() {
  const base = process.env.MNAV_API_BASE;
  if (!base) {
    return Response.json(
      { error: { code: 'MISCONFIGURED', message: 'MNAV_API_BASE not set' } },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
      next: { revalidate: 60 },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err) {
    return Response.json(
      { error: { code: 'UPSTREAM_UNREACHABLE', message: err instanceof Error ? err.message : 'unknown' } },
      { status: 502 }
    );
  }
}
