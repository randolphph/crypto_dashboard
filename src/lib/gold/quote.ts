import type { GoldQuote } from '@/types/gold';

export const GOLD_REFRESH_MS = 30_000;
export const GOLD_FRESH_MS = 120_000;
// Keep the last trade through domestic holiday closures, always marked stale.
export const GOLD_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export function goldQuoteStatus(quote: GoldQuote | undefined, now = Date.now()): 'live' | 'stale' | 'unavailable' {
  if (!quote || quote.symbol !== 'Au99.99' || quote.currency !== 'CNY' || quote.unit !== 'gram' || !['sina-sge', 'sge-daily'].includes(quote.source) || !Number.isFinite(quote.price) || quote.price <= 0) return 'unavailable';
  const age = now - Date.parse(quote.updatedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > GOLD_RETENTION_MS) return 'unavailable';
  return quote.source === 'sge-daily' || age > GOLD_FRESH_MS || quote.status === 'stale' || !!quote.error ? 'stale' : 'live';
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
  if (parsed > now + 60_000) throw new Error('国内黄金行情时间晚于当前时间');
  const quote: GoldQuote = { symbol: 'Au99.99', currency: 'CNY', unit: 'gram', price: Number(fields[3]), source: 'sina-sge', updatedAt: new Date(parsed).toISOString(), receivedAt: new Date(now).toISOString(), status: 'live' };
  const status = goldQuoteStatus(quote, now);
  if (status === 'unavailable') throw new Error('国内黄金报价无效或已超出可用期限');
  return { ...quote, status };
}

/** Official daily close, in CNY/gram. updatedAt is the trading session close,
 * never the time we downloaded this page or an invented live trade time. */
export function parseSgeDailyQuote(html: string, now = Date.now()): GoldQuote {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const table = clean.match(/<table\b[^>]*class=["'][^"']*\bdaily_new_table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) throw new Error('上金所每日行情格式无效');
  const text = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim();
  const headers = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m => text(m[1]));
  const dateIndex = headers.indexOf('日期'), contractIndex = headers.indexOf('合约'), priceIndex = headers.indexOf('收盘价');
  if ([dateIndex, contractIndex, priceIndex].some(index => index < 0)) throw new Error('上金所每日行情字段无效');
  const quotes: GoldQuote[] = [];
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => text(m[1]));
    if (cells[contractIndex] !== 'Au99.99') continue;
    const date = cells[dateIndex], priceText = cells[priceIndex]?.replace(/,/g, '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d+(?:\.\d+)?$/.test(priceText ?? '')) continue;
    const timestamp = Date.parse(`${date}T15:30:00+08:00`);
    if (!Number.isFinite(timestamp) || new Date(timestamp + 8 * 60 * 60_000).toISOString().slice(0, 10) !== date) continue;
    const quote: GoldQuote = { symbol: 'Au99.99', currency: 'CNY', unit: 'gram', price: Number(priceText), source: 'sge-daily', updatedAt: new Date(timestamp).toISOString(), receivedAt: new Date(now).toISOString(), status: 'stale' };
    if (goldQuoteStatus(quote, now) !== 'unavailable') quotes.push(quote);
  }
  const latest = quotes.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (!latest) throw new Error('上金所无可用的 Au99.99 收盘价');
  return latest;
}
