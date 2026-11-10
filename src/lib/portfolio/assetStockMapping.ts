import type { AssetBalance } from '@/types/common';
import type { WalletBalance } from '@/types/onchain';
import { valueManualStockCost, type ManualStockCost, type StockCostValuation } from './manualStockCost';

export type AssetLocation =
  | { source: 'binance'; account: string }
  | { source: 'okx' }
  | { source: 'onchain'; walletId: string };

export interface AssetStockMapping { key: string; symbol: string }
export const defiCategoryKey = (walletId: string, platformId: string, chainId: string) => JSON.stringify(['defi', walletId, platformId, chainId]);

export { normalizeStockSymbol } from './stockSymbol';

export function canMarkStock(location: AssetLocation, balance: Pick<AssetBalance, 'dedupedToDefi'>): boolean {
  return !balance.dedupedToDefi && (location.source !== 'binance' || ['现货', '理财', '资金账户'].includes(location.account));
}

export function assetMappingKey(location: AssetLocation, balance: Pick<AssetBalance, 'asset' | 'chainId' | 'tokenAddress'>): string {
  if (location.source === 'onchain') {
    const address = balance.tokenAddress?.trim();
    // EVM addresses ignore case; Solana token addresses are case sensitive.
    const token = address ? (/^0x/i.test(address) ? address.toLowerCase() : address) : balance.asset;
    return JSON.stringify(['onchain', location.walletId, balance.chainId ?? '', address ? 'address' : 'symbol', token]);
  }
  return JSON.stringify([location.source, location.source === 'binance' ? location.account : '', balance.asset.toUpperCase()]);
}

export type StockSymbolResolver = (assetId: string, knownSymbol?: string) => string | undefined;
export function annotateBalances(balances: AssetBalance[], location: AssetLocation, mappings: AssetStockMapping[], resolveSymbol?: StockSymbolResolver, costs: Record<string, ManualStockCost> = {}): AssetBalance[] {
  const byKey = new Map(mappings.map((entry) => [entry.key, entry.symbol]));
  return balances.map((balance) => {
    const raw = { ...balance };
    delete raw.stockSymbol;
    delete raw.stockCost;
    const key = assetMappingKey(location, balance);
    const known = byKey.get(key);
    const symbol = canMarkStock(location, balance) ? resolveSymbol ? resolveSymbol(`balance:${key}`, known) : known : undefined;
    const stockCost = symbol ? valueManualStockCost(costs[`balance:${key}`], symbol, balance.amount, balance.usdValue, balance.valuationIncomplete) : undefined;
    return symbol ? { ...raw, stockSymbol: symbol, ...(stockCost ? { stockCost } : {}) } : raw;
  });
}

interface ExchangeBalances {
  balances?: AssetBalance[];
  accounts?: Array<{ label: string; balances: AssetBalance[] }>;
}

export function annotateExchange<T extends ExchangeBalances>(data: T, source: 'binance' | 'okx', mappings: AssetStockMapping[], resolveSymbol?: StockSymbolResolver, costs: Record<string, ManualStockCost> = {}): T {
  return {
    ...data,
    ...(data.balances ? { balances: source === 'okx' ? annotateBalances(data.balances, { source }, mappings, resolveSymbol, costs) : data.balances } : {}),
    ...(data.accounts ? { accounts: data.accounts.map((account) => ({ ...account, balances: annotateBalances(account.balances, source === 'binance' ? { source, account: account.label } : { source }, mappings, resolveSymbol, costs) })) } : {}),
  };
}

export function annotateWallets(wallets: WalletBalance[], mappings: AssetStockMapping[], resolveSymbol?: StockSymbolResolver, costs: Record<string, ManualStockCost> = {}): WalletBalance[] {
  return wallets.map((wallet) => ({
    ...wallet,
    balances: annotateBalances(wallet.balances, { source: 'onchain', walletId: wallet.walletId }, mappings, resolveSymbol, costs),
    ...(wallet.defiPositions ? { defiPositions: wallet.defiPositions.map((protocol) => {
      const raw = { ...protocol };
      delete raw.stockSymbol;
      delete raw.stockCost;
      const key = defiCategoryKey(wallet.walletId, protocol.platformId, protocol.chainId);
      const symbol = resolveSymbol?.(key);
      const stockCost = symbol && costs[key]?.quantity !== undefined ? valueManualStockCost(costs[key], symbol, undefined, protocol.totalUsdValue) : undefined;
      return symbol ? { ...raw, stockSymbol: symbol, ...(stockCost ? { stockCost } : {}) } : raw;
    }) } : {}),
  }));
}

export interface MappedStockHolding {
  symbol: string;
  market: 'US';
  valueUsd: number;
  sourceLabel: string;
  amount?: number;
  assetSymbol?: string;
  tokenQuantities?: Array<{ amount: number; assetSymbol: string }>;
  stockCost?: StockCostValuation;
}

export function mappedStockHoldings(input: { binance?: ExchangeBalances & { configured?: boolean }; okx?: ExchangeBalances & { configured?: boolean }; onchain?: WalletBalance[] }): MappedStockHolding[] {
  const out: MappedStockHolding[] = [];
  const add = (balances: AssetBalance[], source: string) => {
    for (const balance of balances) {
      if (!balance.stockSymbol || balance.dedupedToDefi || !Number.isFinite(balance.usdValue) || balance.usdValue <= 0) continue;
      out.push({ symbol: balance.stockSymbol, market: 'US', valueUsd: balance.usdValue, sourceLabel: `${source} · ${balance.asset}`, amount: balance.amount, assetSymbol: balance.asset, ...(balance.stockCost ? { stockCost: balance.stockCost } : {}) });
    }
  };
  if (input.binance?.configured !== false) for (const account of input.binance?.accounts ?? []) {
    if (['现货', '理财', '资金账户'].includes(account.label)) add(account.balances, `Binance ${account.label}`);
  }
  if (input.okx?.configured !== false) add(input.okx?.balances ?? [], 'OKX');
  for (const wallet of input.onchain ?? []) {
    add(wallet.balances, wallet.walletName);
    for (const protocol of wallet.defiPositions ?? []) {
      if (!protocol.stockSymbol || !Number.isFinite(protocol.totalUsdValue) || protocol.totalUsdValue === 0) continue;
      // A protocol tag applies to its net valuation once. Detail token values
      // must not be added again or converted into fictitious stock shares.
      out.push({ symbol: protocol.stockSymbol, market: 'US', valueUsd: protocol.totalUsdValue,
        sourceLabel: `${wallet.walletName} · ${protocol.platformName} (${protocol.network})`,
        ...(protocol.stockCost ? { stockCost: protocol.stockCost } : {}),
        tokenQuantities: protocol.positions.flatMap((position) => position.tokens
          .filter((token) => Number.isFinite(token.amount))
          .map((token) => ({ amount: token.amount, assetSymbol: token.symbol }))),
      });
    }
  }
  return out;
}
