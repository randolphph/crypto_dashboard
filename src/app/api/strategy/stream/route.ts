import { getVersion, listTables } from '@/lib/strategy/serverStore';

export const dynamic = 'force-dynamic';
// Vercel: keep a single SSE connection open for ~50s, then close so the
// platform's function timeout doesn't kill us mid-frame. EventSource auto-
// reconnects from the client side, so this is invisible to the user.
export const maxDuration = 60;

const CLOSE_AFTER_MS = 50_000;
const POLL_EVERY_MS = 2_000;
const PING_EVERY_MS = 15_000;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function GET(request: Request) {
  const signal = request.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        // Initial snapshot — lets a freshly-opened page hydrate without a
        // separate REST call.
        let tables = await listTables();
        let version = await getVersion();
        send('snapshot', { tables, version });

        const startedAt = Date.now();
        let lastPing = Date.now();

        while (!signal.aborted && Date.now() - startedAt < CLOSE_AFTER_MS) {
          await delay(POLL_EVERY_MS, signal);
          if (signal.aborted) break;
          try {
            const v = await getVersion();
            if (v !== version) {
              version = v;
              tables = await listTables();
              send('tables', { tables, version });
            }
          } catch {
            // Transient Redis errors shouldn't kill the stream — next tick
            // will retry.
          }
          if (Date.now() - lastPing > PING_EVERY_MS) {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
            lastPing = Date.now();
          }
        }
      } catch {
        // Fall through to close.
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed if the client disconnected.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Prevent CDN/proxies (Cloudflare, Vercel edge) from buffering SSE.
      'X-Accel-Buffering': 'no',
    },
  });
}
