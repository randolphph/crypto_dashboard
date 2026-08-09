import 'server-only';

import { createHash } from 'crypto';
import { redis } from '@/lib/cache/upstash';

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function clientIdentifier(request: Request): string {
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-forwarded-for') ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const ip = forwarded.split(',')[0]?.trim() || 'unknown';
  return createHash('sha256').update(ip).digest('hex').slice(0, 20);
}

/**
 * Fixed-window, per-client rate limit. Redis is shared across instances in
 * production; the in-memory fallback keeps local development deterministic.
 * Infrastructure failures fail open so a cache outage does not take down the
 * dashboard.
 */
export async function enforceRateLimit(
  request: Request,
  namespace: string,
  limit: number,
  windowSeconds: number
): Promise<Response | null> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const bucket = Math.floor(now / windowMs);
  const key = `rate:${namespace}:${clientIdentifier(request)}:${bucket}`;
  let count: number;

  try {
    if (redis) {
      count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds + 5);
    } else {
      const current = memoryCounters.get(key);
      if (!current || current.expiresAt <= now) {
        count = 1;
        memoryCounters.set(key, { count, expiresAt: (bucket + 1) * windowMs });
      } else {
        count = current.count + 1;
        current.count = count;
      }

      if (memoryCounters.size > 500) {
        for (const [k, value] of memoryCounters) {
          if (value.expiresAt <= now) memoryCounters.delete(k);
        }
      }
    }
  } catch {
    return null;
  }

  if (count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000));
  return Response.json(
    { error: 'rate limit exceeded', retryAfter },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
      },
    }
  );
}

export class RequestInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 413 = 400
  ) {
    super(message);
  }
}

export async function readJsonBody(
  request: Request,
  maxBytes = 256 * 1024
): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestInputError('request body too large', 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestInputError('request body too large', 413);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new RequestInputError('invalid json body');
  }
}

export function inputErrorResponse(error: unknown): Response {
  if (error instanceof RequestInputError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return Response.json(
    { error: error instanceof Error ? error.message : 'invalid request' },
    { status: 400, headers: { 'Cache-Control': 'no-store' } }
  );
}
