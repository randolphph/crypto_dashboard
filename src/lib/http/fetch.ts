import 'server-only';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Server-side fetch with a hard deadline. The timeout signal remains attached
 * while the response body is consumed, so a peer that sends headers and then
 * stalls cannot keep a Vercel Function alive indefinitely.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
}
