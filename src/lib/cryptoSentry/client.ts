import { ApiResponseError } from '@/lib/fetchError';
import type { CryptoSentryApiError } from '@/types/cryptoSentry';

export async function cryptoSentryRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const normalizedPath = path.replace(/^\/+/, '');
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api/crypto-sentry/${normalizedPath}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | CryptoSentryApiError
      | null;
    throw new ApiResponseError(
      body?.error?.message ?? `CryptoSentry 请求失败（HTTP ${response.status}）`,
      response.status,
      body?.error?.code,
      body?.error?.fields
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
