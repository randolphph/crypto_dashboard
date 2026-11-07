import 'server-only';
import { redis } from '@/lib/cache/upstash';
import { parseGoldQuote, parseSgeDailyQuote, goldQuoteStatus, GOLD_REFRESH_MS, GOLD_RETENTION_MS } from './quote';
import { GoldQuoteUnavailable, type GoldSourceFailure } from './errors';
import type { GoldQuote } from '@/types/gold';

const CACHE_KEY = 'gold:quote:sge-au9999:v1';
let lastQuote: GoldQuote | undefined;
let checkedAt = 0;
let lastError: GoldQuoteUnavailable | undefined;
let inFlight: Promise<GoldQuote> | undefined;

// Cache outages must not prevent a valid upstream price from being served.
async function cacheAttempt<T>(work: () => Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 500); })]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function persist(quote: GoldQuote) {
  if (redis) await cacheAttempt(() => redis!.set(CACHE_KEY, quote, { ex: GOLD_RETENTION_MS / 1000 }));
}

async function restore(): Promise<GoldQuote | undefined> {
  if (!redis) return undefined;
  const quote = await cacheAttempt(() => redis!.get<GoldQuote>(CACHE_KEY));
  return quote && goldQuoteStatus(quote) !== 'unavailable' ? quote : undefined;
}

function failure(source: GoldSourceFailure['source'], cause: unknown): GoldSourceFailure {
  const error = cause instanceof Error ? cause : undefined;
  const reason = error?.message === '国内黄金行情时间晚于当前时间' ? '行情时间异常'
    : error?.name === 'TimeoutError' || error?.name === 'AbortError' ? '连接超时'
    : error instanceof TypeError ? '网络连接失败' : '报价无效或过期';
  return { source, reason };
}

function httpFailure(source: GoldSourceFailure['source'], status: number): GoldSourceFailure {
  return { source, reason: status === 429 ? '限流（HTTP 429）' : '服务暂不可用', status };
}

async function officialClose(): Promise<GoldQuote> {
  const date = (now: number) => new Date(now + 8 * 60 * 60_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({ start_date: date(Date.now() - GOLD_RETENTION_MS), end_date: date(Date.now()), inst_ids: 'Au99.99' });
  const response = await fetch(`https://www.sge.com.cn/sjzx/quotation_daily_new?${params}`, { signal: AbortSignal.timeout(4000), next: { revalidate: 300 } });
  if (!response.ok) throw new GoldQuoteUnavailable([httpFailure('上金所', response.status)]);
  return parseSgeDailyQuote(await response.text());
}

export async function fetchGoldQuote(): Promise<GoldQuote> {
  if (Date.now() - checkedAt < GOLD_REFRESH_MS) {
    if (lastQuote && goldQuoteStatus(lastQuote) !== 'unavailable') return lastQuote;
    if (lastError) throw lastError;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch('https://hq.sinajs.cn/list=SGE_AU9999', { headers: { Referer: 'https://finance.sina.com.cn/' }, signal: AbortSignal.timeout(4000), next: { revalidate: 30 } });
      if (!response.ok) throw new GoldQuoteUnavailable([httpFailure('新浪', response.status)]);
      const quote = parseGoldQuote(new TextDecoder('gb18030').decode(await response.arrayBuffer()));
      const changed = !lastQuote || quote.updatedAt !== lastQuote.updatedAt || quote.price !== lastQuote.price || quote.source !== lastQuote.source;
      lastQuote = quote;
      lastError = undefined;
      if (changed) await persist(quote);
      return quote;
    } catch (cause) {
      const failures = cause instanceof GoldQuoteUnavailable ? cause.failures : [failure('新浪', cause)];
      const [cached, daily] = await Promise.all([restore(), officialClose().then(quote => quote, error => {
        failures.push(...(error instanceof GoldQuoteUnavailable ? error.failures : [failure('上金所', error)]));
        return undefined;
      })]);
      lastError = new GoldQuoteUnavailable(failures);
      const previous = lastQuote;
      // A recent cached trade can be newer than yesterday's official close.
      const best = [previous, cached, daily].filter((q): q is GoldQuote => !!q && goldQuoteStatus(q) !== 'unavailable')
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
      if (best) {
        lastQuote = { ...best, status: 'stale', error: `${lastError.message}，使用国内最近${best.source === 'sge-daily' ? '收盘' : '成交'}价` };
        if (best === daily && (!previous || previous.updatedAt !== best.updatedAt || previous.price !== best.price || previous.source !== best.source)) await persist(best);
        return lastQuote;
      }
      console.warn('[gold] No usable domestic quote', failures);
      throw lastError;
    } finally {
      checkedAt = Date.now();
      inFlight = undefined;
    }
  })();
  return inFlight;
}
