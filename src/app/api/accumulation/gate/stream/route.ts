export const dynamic = 'force-dynamic';

// Keep this route temporarily as a tombstone for clients from an older
// deployment. EventSource treats HTTP 204 as an instruction not to reconnect,
// so already-open tabs stop their 50-second SSE loop after the next retry.
export function GET() {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
