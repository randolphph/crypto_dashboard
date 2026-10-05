import type { AssetBalance } from '@/types/common';

// Aave market prefixes from the Aave DAO token list. Longer prefixes must be
// checked first (e.g. aEthLido before aEth). The empty prefix is Ethereum V2.
// https://github.com/aave-dao/aave-address-book/blob/main/tokenlist.json
const MARKET_PREFIXES: Record<string, string[]> = {
  '1': ['aEthEtherFi', 'aEthLido', 'aHorRwa', 'aEth', 'aAmm', 'a'],
  '10': ['aOpt'],
  '42161': ['aArb'],
  '8453': ['aBas'],
  '56': ['aBnb'],
  '9745': ['aPla'],
};

export function isAaveProtocol(name: string): boolean {
  return /\baave(?:\b|v[23])/i.test(name);
}

// aTokens are excluded from wallet assets by policy, independently of whether
// the DeFi API returned the corresponding Aave position or matching amount.
export function isAaveReceiptBalance(balance: Pick<AssetBalance, 'asset' | 'chainId'>): boolean {
  const bare = balance.asset.replace(/\([^)]+\)$/, '').trim();
  const prefix = MARKET_PREFIXES[String(balance.chainId)]?.find((item) => bare.startsWith(item));
  if (!prefix) return false;
  const underlying = bare.slice(prefix.length);
  // V2 symbols use uppercase underlying names (aUSDT, aSTETH). Avoid treating
  // arbitrary words beginning with "a" as receipts on Ethereum.
  return prefix === 'a'
    ? /^[A-Z0-9][A-Z0-9_]*$/.test(underlying)
    : /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(underlying);
}
