import 'server-only';
import { parseGoldQuote, goldQuoteStatus, GOLD_REFRESH_MS } from './quote';
import type { GoldQuote } from '@/types/gold';

// One shared quote per process; Next's data cache also reuses it between requests.
// A failed refresh has the same cooldown, avoiding repeated upstream retries.
let lastQuote: GoldQuote | undefined;
let checkedAt = 0;
let lastError: Error | undefined;
let inFlight: Promise<GoldQuote> | undefined;

export async function fetchGoldQuote(): Promise<GoldQuote> {
  if (Date.now() - checkedAt < GOLD_REFRESH_MS) {
    if (lastQuote && goldQuoteStatus(lastQuote) !== 'unavailable') return lastQuote;
    if (lastError) throw lastError;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch('https://hq.sinajs.cn/list=SGE_AU9999', { headers: { Referer: 'https://finance.sina.com.cn/' }, signal: AbortSignal.timeout(6000), next: { revalidate: 30 } });
      if (!response.ok) throw new Error(`黄金行情服务暂不可用 (${response.status})`);
      lastQuote = parseGoldQuote(new TextDecoder('gb18030').decode(await response.arrayBuffer()));
      lastError = undefined;
      return lastQuote;
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error('黄金行情暂不可用');
      if (lastQuote && goldQuoteStatus(lastQuote) !== 'unavailable') {
        lastQuote = { ...lastQuote, status: 'stale', error: '行情刷新失败，使用国内最近成交价' };
        return lastQuote;
      }
      throw lastError;
    } finally {
      checkedAt = Date.now();
      inFlight = undefined;
    }
  })();
  return inFlight;
}
