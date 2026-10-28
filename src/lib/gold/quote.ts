import type { GoldQuote } from '@/types/gold';

export const GOLD_REFRESH_MS = 30_000;
export const GOLD_FRESH_MS = 120_000;
// Keep the last trade through domestic holiday closures, always marked stale.
export const GOLD_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export function goldQuoteStatus(quote: GoldQuote | undefined, now = Date.now()): 'live' | 'stale' | 'unavailable' {
  if (!quote || quote.symbol !== 'Au99.99' || quote.currency !== 'CNY' || quote.unit !== 'gram' || quote.source !== 'sina-sge' || !Number.isFinite(quote.price) || quote.price <= 0) return 'unavailable';
  const age = now - Date.parse(quote.updatedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > GOLD_RETENTION_MS) return 'unavailable';
  return age > GOLD_FRESH_MS || quote.status === 'stale' || !!quote.error ? 'stale' : 'live';
}

// SGE_AU9999 fields: code, name, contract, last, average, previous close,
// open, high, low, previous settlement, bid, ask, bid/ask size, volume,
// turnover, Beijing quote timestamp, percentage change. Never execute the JS.
export function parseGoldQuote(input: string, now = Date.now()): GoldQuote {
  const match = input.match(/(?:^|[;\r\n])\s*(?:var\s+)?hq_str_SGE_AU9999\s*=\s*"([^"\r\n]*)"\s*;/);
  if (!match) throw new Error('国内黄金行情格式无效');
  const fields = match[1].split(',');
  if (fields.length < 17 || fields[0] !== 'AU9999' || fields[2] !== 'Au99.99' || !/^\d+(?:\.\d+)?$/.test(fields[3]) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(fields[16])) throw new Error('国内黄金行情格式无效');
  const timestamp = `${fields[16].replace(' ', 'T')}+08:00`;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || new Date(parsed + 8 * 60 * 60_000).toISOString().slice(0, 19) !== fields[16].replace(' ', 'T')) throw new Error('国内黄金行情时间无效');
  const quote: GoldQuote = { symbol: 'Au99.99', currency: 'CNY', unit: 'gram', price: Number(fields[3]), source: 'sina-sge', updatedAt: new Date(parsed).toISOString(), receivedAt: new Date(now).toISOString(), status: 'live' };
  const status = goldQuoteStatus(quote, now);
  if (status === 'unavailable') throw new Error('国内黄金报价无效或已超出可用期限');
  return { ...quote, status };
}
