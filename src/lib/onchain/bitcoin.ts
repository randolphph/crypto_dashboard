import 'server-only';
import type { AssetBalance } from '@/types/common';
import type { WalletConfig } from '@/types/onchain';
import { isOkxWeb3Available, fetchBitcoinBalancesViaOkx } from './okxWeb3';

/**
 * Fetch Bitcoin wallet balances via OKX Web3 API.
 * No RPC fallback — Bitcoin requires OKX Web3 API credentials.
 */
export async function fetchBitcoinWalletBalances(
  wallet: WalletConfig
): Promise<AssetBalance[]> {
  if (!isOkxWeb3Available()) {
    console.warn(
      `OKX Web3 API not configured, cannot fetch Bitcoin balance for ${wallet.name}`
    );
    return [];
  }

  return fetchBitcoinBalancesViaOkx(wallet.address);
}
