import 'server-only';
import { createHash, createHmac } from 'crypto';

export interface LongportCreds {
  appKey: string;
  appSecret: string;
  accessToken: string;
}

function sha1Hex(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex');
}

function hmacSha256Hex(key: string, msg: string): string {
  return createHmac('sha256', key).update(msg, 'utf8').digest('hex');
}

/**
 * Build the headers required by LongPort REST. The canonical-request format
 * and HMAC scheme are non-obvious — keep the construction in one place so the
 * spec stays auditable.
 *
 *   canonical = METHOD|PATH|QUERY|
 *               authorization:<token>\nx-api-key:<key>\nx-timestamp:<ts>\n
 *               |authorization;x-api-key;x-timestamp|
 *               [sha1_hex(body) when body present]
 *   signature = hmac_sha256_hex(appSecret, "HMAC-SHA256|" + sha1_hex(canonical))
 */
export function buildLongportHeaders(
  creds: LongportCreds,
  method: string,
  path: string,
  query: string,
  body: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonicalHeaders =
    `authorization:${creds.accessToken}\n` +
    `x-api-key:${creds.appKey}\n` +
    `x-timestamp:${timestamp}\n` +
    `|authorization;x-api-key;x-timestamp|`;
  let canonical = `${method.toUpperCase()}|${path}|${query}|${canonicalHeaders}`;
  if (body) canonical += sha1Hex(body);
  const payload = `HMAC-SHA256|${sha1Hex(canonical)}`;
  const signature = hmacSha256Hex(creds.appSecret, payload);

  const headers: Record<string, string> = {
    Authorization: creds.accessToken,
    'X-Api-Key': creds.appKey,
    'X-Timestamp': timestamp,
    'X-Api-Signature': `HMAC-SHA256 SignedHeaders=authorization;x-api-key;x-timestamp, Signature=${signature}`,
  };
  if (body) headers['Content-Type'] = 'application/json';
  return headers;
}
