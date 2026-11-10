export function normalizeStockSymbol(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)*$/.test(symbol) || symbol.length > 20) {
    throw new Error('请填写有效美股代码，例如 NVDA、BRK.B');
  }
  return symbol;
}
