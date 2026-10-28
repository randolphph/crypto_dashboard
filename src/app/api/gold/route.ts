import { fetchGoldQuote } from '@/lib/gold/server';
import { enforceRateLimit } from '@/lib/http/guards';

export const maxDuration = 10;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'gold', 60, 60);
  if (limited) return limited;
  try {
    return Response.json(await fetchGoldQuote(), { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30' } });
  } catch {
    return Response.json({ error: '黄金行情暂不可用，请稍后重试' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
