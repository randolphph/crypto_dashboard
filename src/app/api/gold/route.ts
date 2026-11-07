import { fetchGoldQuote } from '@/lib/gold/server';
import { GoldQuoteUnavailable } from '@/lib/gold/errors';
import { enforceRateLimit } from '@/lib/http/guards';

export const maxDuration = 15;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'gold', 60, 60);
  if (limited) return limited;
  try {
    return Response.json(await fetchGoldQuote(), { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' } });
  } catch (cause) {
    return Response.json({ error: cause instanceof GoldQuoteUnavailable ? cause.message : '黄金行情暂不可用，请稍后重试', ...(cause instanceof GoldQuoteUnavailable ? { sources: cause.failures } : {}) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
