import type { AssetBalance } from '@/types/common';
import { BROKER_LABEL, type StocksData, type StockBroker } from '@/types/stocks';
import type { WalletBalance } from '@/types/onchain';
import { assetMappingKey, defiCategoryKey, type AssetLocation } from './assetStockMapping';
import type { ValuedGoldHolding } from '@/types/gold';
export { defiCategoryKey } from './assetStockMapping';

export interface AssetCategory { id: string; name: string; color: string }
export const US_STOCK_CATEGORY_ID = 'us-stocks';
export const US_STOCK_CATEGORY: AssetCategory = { id: US_STOCK_CATEGORY_ID, name: '美股', color: '#6366f1' };
export const GOLD_CATEGORY_ID = 'gold';
export const GOLD_CATEGORY: AssetCategory = { id: GOLD_CATEGORY_ID, name: '黄金', color: '#d97706' };
export const DEFAULT_ASSET_CATEGORIES: AssetCategory[] = [
  { id: 'cash', name: '现金及等价物', color: '#10b981' },
  { id: 'stocks', name: '股票', color: '#3b82f6' },
  { id: 'crypto', name: '加密资产', color: '#f59e0b' },
  US_STOCK_CATEGORY,
  GOLD_CATEGORY,
];
export const CATEGORY_PALETTE = ['#8b5cf6', '#06b6d4', '#ec4899', '#ef4444', '#84cc16', '#f97316'];
export interface CategoryConfiguration {
  categories: AssetCategory[];
  assignments: Record<string, string>;
  redirects: Record<string, string>;
  defaultCategoryId: string;
  usStockSymbols?: Record<string, string>;
}
export interface ClassificationAsset {
  id: string;
  label: string;
  source: string;
  value: number;
  defaultCategoryId?: string;
  nativeStockSymbol?: string;
}
export interface CategoryBucket { id: string; label: string; color: string; value: number; details: Array<{ label: string; value: number }> }
export const stockCategoryKey = (broker: StockBroker, id: string) => `stock:${broker}:${id}`;
export const stockCashCategoryKey = (broker: StockBroker, id: string) => `stock-cash:${broker}:${id}`;
export const bankCategoryKey = (id: string) => `bank:${id}`;
export const customCategoryKey = (id: string) => `custom:${id}`;
export const goldCategoryKey = (id: string) => `gold:${id}`;
export const balanceCategoryKey = (location: AssetLocation, balance: AssetBalance) => `balance:${assetMappingKey(location, balance)}`;
const STABLES = new Set(['USDT','USDC','USDG','USD1','DAI','FDUSD','TUSD','BUSD','PYUSD','USDP','USDD']);
export function defaultStockCategory(symbol: string, kind?: string, market?: string): string {
  return kind !== 'option' && ['SGOV','BIL','SHV','USFR'].includes(symbol.trim().toUpperCase()) ? 'cash' : market === 'US' ? US_STOCK_CATEGORY_ID : 'stocks';
}
export function defaultBalanceCategory(balance: Pick<AssetBalance, 'asset' | 'stockSymbol'>, cashEligible = true): string {
  if (balance.stockSymbol) return US_STOCK_CATEGORY_ID;
  const symbol = balance.asset.replace(/\([^)]+\)$/, '').toUpperCase();
  return cashEligible && (STABLES.has(symbol) || symbol.startsWith('LD') && STABLES.has(symbol.slice(2))) ? 'cash' : 'crypto';
}
export function resolveAssetCategory(config: CategoryConfiguration, id: string, fallback?: string): string {
  let category = config.assignments[id] ?? fallback ?? config.defaultCategoryId;
  const seen = new Set<string>();
  while (config.redirects[category] && !seen.has(category)) { seen.add(category); category = config.redirects[category]; }
  return config.categories.some((entry) => entry.id === category) ? category : config.defaultCategoryId;
}
export function resolveUsStockSymbol(config: CategoryConfiguration, id: string, knownSymbol?: string, fallback?: string): string | undefined {
  if (resolveAssetCategory(config, id, fallback ?? (knownSymbol ? US_STOCK_CATEGORY_ID : undefined)) !== US_STOCK_CATEGORY_ID) return undefined;
  return config.usStockSymbols?.[id] ?? knownSymbol;
}
export function aggregateAssetCategories(assets: ClassificationAsset[], config: CategoryConfiguration): CategoryBucket[] {
  const buckets = new Map(config.categories.map((entry) => [entry.id, { id: entry.id, label: entry.name, color: entry.color, value: 0, details: [] } as CategoryBucket]));
  for (const asset of assets) {
    if (!Number.isFinite(asset.value)) continue;
    const bucket = buckets.get(resolveAssetCategory(config, asset.id, asset.defaultCategoryId));
    if (!bucket) continue;
    bucket.value += asset.value;
    const label = `${asset.label} · ${asset.source}`;
    const existing = bucket.details.find((entry) => entry.label === label);
    if (existing) existing.value += asset.value;
    else bucket.details.push({ label, value: asset.value });
  }
  return [...buckets.values()].map((bucket) => ({ ...bucket, details: bucket.details.sort((a,b) => b.value - a.value) }));
}

interface ExchangeData {
  configured?: boolean;
  totalUsdValue?: number;
  balances?: AssetBalance[];
  accounts?: Array<{ label: string; balances: AssetBalance[]; totalUsdValue?: number }>;
}
export interface ClassificationInput {
  binance?: ExchangeData;
  okx?: ExchangeData;
  deribit?: { configured?: boolean; totalUsdValue?: number };
  onchain?: WalletBalance[];
  stocks?: StocksData;
  banks: Array<{ id: string; bank: string; currency: string; valueUsd: number }>;
  customAssets: Array<{ id: string; name: string; value: number }>;
  gold?: ValuedGoldHolding[];
}
export function buildClassificationAssets(input: ClassificationInput): ClassificationAsset[] {
  const rows: ClassificationAsset[] = [];
  const add = (row: ClassificationAsset) => { if (Number.isFinite(row.value)) rows.push(row); };
  const reconcile = (start: number, total: number | undefined, id: string, source: string, defaultCategoryId: string) => {
    if (total === undefined || !Number.isFinite(total)) return;
    const remainder = total - rows.slice(start).reduce((sum,row) => sum + row.value, 0);
    if (Math.abs(remainder) > 0.000001) add({ id, label: '账户余额调整', source, value: remainder, defaultCategoryId });
  };
  const balances = (items: AssetBalance[], location: AssetLocation, source: string, cashEligible = true) => {
    for (const balance of items) {
      if (balance.dedupedToDefi) continue;
      add({ id: balanceCategoryKey(location, balance), label: balance.stockSymbol ? `${balance.asset} → ${balance.stockSymbol}` : balance.asset, source, value: balance.usdValue, defaultCategoryId: defaultBalanceCategory(balance, cashEligible) });
    }
  };
  if (input.binance && input.binance.configured !== false) {
    const start = rows.length;
    for (const account of input.binance.accounts ?? []) balances(account.balances, { source: 'binance', account: account.label }, `Binance ${account.label}`, ['现货','理财','资金账户'].includes(account.label));
    reconcile(start, input.binance.totalUsdValue, 'source:binance:adjustment', 'Binance', 'crypto');
  }
  if (input.okx && input.okx.configured !== false) {
    const start = rows.length;
    balances(input.okx.balances ?? [], { source: 'okx' }, 'OKX');
    reconcile(start, input.okx.totalUsdValue, 'source:okx:adjustment', 'OKX', 'crypto');
  }
  if (input.deribit && input.deribit.configured !== false) add({ id: 'deribit:equity', label: '账户净值', source: 'Deribit', value: input.deribit.totalUsdValue ?? 0, defaultCategoryId: 'crypto' });
  for (const wallet of input.onchain ?? []) {
    const start = rows.length;
    balances(wallet.balances, { source: 'onchain', walletId: wallet.walletId }, wallet.walletName);
    for (const protocol of wallet.defiPositions ?? []) add({ id: defiCategoryKey(wallet.walletId, protocol.platformId, protocol.chainId), label: `${protocol.platformName} · ${protocol.network}`, source: wallet.walletName, value: protocol.totalUsdValue, defaultCategoryId: 'crypto' });
    reconcile(start, wallet.totalUsdValue, `wallet:${wallet.walletId}:adjustment`, wallet.walletName, 'crypto');
  }
  for (const broker of input.stocks?.brokers ?? []) {
    const start = rows.length;
    for (const p of broker.positions) add({ id: stockCategoryKey(broker.broker, p.id), label: `${p.symbol}${p.name || p.quoteName ? ` · ${p.name || p.quoteName}` : ''}`, source: BROKER_LABEL[broker.broker], value: p.marketValueUsd, defaultCategoryId: defaultStockCategory(p.symbol, p.kind, p.market), nativeStockSymbol: p.market === 'US' ? p.symbol : undefined });
    for (const c of broker.cash) add({ id: stockCashCategoryKey(broker.broker, c.id), label: `${c.currency} 现金`, source: BROKER_LABEL[broker.broker], value: c.amountUsd, defaultCategoryId: 'cash' });
    reconcile(start, broker.totalUsdValue, `stock:${broker.broker}:adjustment`, BROKER_LABEL[broker.broker], 'stocks');
  }
  for (const bank of input.banks) add({ id: bankCategoryKey(bank.id), label: `${bank.bank} ${bank.currency}`, source: '银行', value: bank.valueUsd, defaultCategoryId: 'cash' });
  for (const asset of input.customAssets) add({ id: customCategoryKey(asset.id), label: asset.name, source: '自定义资产', value: asset.value });
  for (const holding of input.gold ?? []) if (holding.valueUsd !== null) add({ id: goldCategoryKey(holding.id), label: holding.name, source: holding.valuationBasis === 'cost' ? '黄金（成本估值）' : holding.priceSource === 'sina-sge' ? '黄金（上金所 Au99.99）' : '黄金（国际现货估值）', value: holding.valueUsd, defaultCategoryId: GOLD_CATEGORY_ID });
  // The same economic asset may be returned in several fragments. Its tag
  // stays stable and its valuation is included exactly once per fragment.
  const unique = new Map<string, ClassificationAsset>();
  for (const row of rows) {
    const existing = unique.get(row.id);
    if (existing) existing.value += row.value;
    else unique.set(row.id, { ...row });
  }
  return [...unique.values()];
}
