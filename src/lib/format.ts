export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  CNY: 'zh-CN',
  HKD: 'zh-HK',
};

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
