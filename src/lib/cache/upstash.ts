import 'server-only';
import { Redis } from '@upstash/redis';

// Accept both name schemes: KV_REST_API_* is what Vercel's marketplace Upstash
// integration injects (legacy Vercel-KV variable names); UPSTASH_REDIS_REST_*
// is the native Upstash naming. Same backend, different envelopes.
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis: Redis | null =
  url && token ? new Redis({ url, token }) : null;
