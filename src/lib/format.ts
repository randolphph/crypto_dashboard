export const formatUsd = (value: number): string => formatCurrency(value, 'USD');

const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  CNY: 'zh-CN',
  HKD: 'zh-HK',
};

const currencyFormats = new Map<string, Intl.NumberFormat>();
export function formatCurrency(value: number, currency: string): string {
  let formatter = currencyFormats.get(currency);
  if (!formatter) { formatter = new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });currencyFormats.set(currency, formatter); }
  return formatter.format(Math.abs(value) < .5 ? 0 : value);
}

export function formatCrypto(value: number, decimals = 8): string {
  if (value === 0) return '0';
  const formatted = value.toFixed(decimals);
  return formatted.replace(/\.?0+$/, '');
}

export function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
