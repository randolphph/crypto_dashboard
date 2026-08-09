import 'server-only';
import { buildLongportHeaders, type LongportCreds } from './sign';
import { fetchWithTimeout } from '@/lib/http/fetch';

export const LONGPORT_BASE = 'https://openapi.longportapp.com';

export class LongportError extends Error {
  constructor(
    public path: string,
    public code: number | string | undefined,
    message: string
  ) {
    super(message);
  }
}

interface LpEnvelope<T> {
  code: number;
  message?: string;
  data: T;
}

export async function lpGet<T>(
  creds: LongportCreds,
  path: string,
  query?: Record<string, string | string[] | undefined>
): Promise<T> {
  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) {
        for (const x of v) if (x != null) params.append(k, x);
      } else if (v != null) {
        params.append(k, v);
      }
    }
  }
  const qs = params.toString();
  const url = `${LONGPORT_BASE}${path}${qs ? `?${qs}` : ''}`;
  const headers = buildLongportHeaders(creds, 'GET', path, qs, '');

  const res = await fetchWithTimeout(url, { method: 'GET', headers, cache: 'no-store' });
  let body: LpEnvelope<T> | { code?: number; message?: string };
  try {
    body = (await res.json()) as LpEnvelope<T>;
  } catch {
    throw new LongportError(path, res.status, `http ${res.status}: non-JSON response`);
  }
  const env = body as LpEnvelope<T>;
  if (!res.ok || env.code !== 0) {
    throw new LongportError(
      path,
      env.code ?? res.status,
      env.message || `http ${res.status}`
    );
  }
  return env.data;
}
