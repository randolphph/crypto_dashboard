import type { WalletBalance, WalletConfig } from '@/types/onchain';

export const ONCHAIN_FRESH_MS = 10 * 60 * 1000;
export const ONCHAIN_SERVER_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const ONCHAIN_BROWSER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const ONCHAIN_CHECK_MS = 2 * 60 * 1000;
export const ONCHAIN_WARNING_MS = 60 * 60 * 1000;

export function walletChains(wallet: WalletConfig) {
  return [...new Set(wallet.chains?.length ? wallet.chains : [wallet.network ?? 'ethereum'])].sort();
}

export function normalizedWalletAddress(address: string): string {
  // Solana and legacy Bitcoin addresses are case-sensitive.
  return /^(0x|bc1|tb1)/i.test(address) ? address.toLowerCase() : address;
}

export function isSuccessfulWallet(value: WalletBalance): boolean {
  return !value.error && value.dataQuality?.complete === true &&
    Number.isFinite(value.totalUsdValue) && value.totalUsdValue >= 0 &&
    value.balances.every((balance) => Number.isFinite(balance.amount) && Number.isFinite(balance.usdValue)) &&
    (value.defiPositions ?? []).every((position) => Number.isFinite(position.totalUsdValue));
}

export function hasOnchainWarning(wallet: WalletBalance, now = Date.now()): boolean {
  return !!wallet.error || wallet.dataQuality?.complete === false || !!wallet.cache?.refreshError ||
    (!!wallet.dataUpdatedAt && now - wallet.dataUpdatedAt > ONCHAIN_WARNING_MS);
}
