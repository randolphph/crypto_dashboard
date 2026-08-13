import { fetchBinanceExecutions } from '@/lib/exchanges/binance';
import { enforceRateLimit } from '@/lib/http/guards';

const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const maxDuration = 35;

function symbolsFromHeader(value: string | null | undefined): string[] {
  return (value ?? '').split(/[\s,;]+/).filter(Boolean);
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'binance-trades', 12, 60);
  if (limited) return limited;

  const apiKey = request.headers.get('x-binance-api-key') || process.env.BINANCE_API_KEY;
  const apiSecret = request.headers.get('x-binance-api-secret') || process.env.BINANCE_API_SECRET;
  const symbols = symbolsFromHeader(
    request.headers.get('x-binance-trade-symbols') || process.env.BINANCE_TRADE_SYMBOLS
  );
  if (!apiKey || !apiSecret) {
    return Response.json(
      { error: 'Binance API Key 尚未配置' },
      { status: 400, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  if (symbols.length === 0) {
    return Response.json(
      { executions: [], configured: false, error: '请先在 API 设置填写账本成交交易对' },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  const requestedSince = Number(new URL(request.url).searchParams.get('since'));
  const now = Date.now();
  const startTime = Number.isFinite(requestedSince)
    ? Math.max(now - MAX_LOOKBACK_MS, Math.min(requestedSince, now))
    : now - MAX_LOOKBACK_MS;

  try {
    const { executions, errors } = await fetchBinanceExecutions(
      apiKey,
      apiSecret,
      symbols,
      startTime,
      now
    );
    if (executions.length === 0 && errors.length > 0) {
      throw new Error(errors[0]);
    }
    return Response.json(
      { executions, configured: true, warnings: errors },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Binance 成交查询失败' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
