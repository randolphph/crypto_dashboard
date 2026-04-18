import 'server-only';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { AssetBalance } from '@/types/common';
import type { WalletConfig } from '@/types/onchain';
import { isOkxWeb3Available, fetchSolanaBalancesViaOkx } from './okxWeb3';

function getConnection() {
  const rpcUrl =
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Primary entry: try OKX Web3 API first, fall back to direct RPC.
 */
export async function fetchSolanaWalletBalances(
  wallet: WalletConfig
): Promise<AssetBalance[]> {
  if (isOkxWeb3Available()) {
    try {
      return await fetchSolanaBalancesViaOkx(wallet.address);
    } catch (error) {
      console.warn(
        `OKX Web3 API failed for ${wallet.name}, falling back to RPC:`,
        error
      );
    }
  }

  return fetchSolanaWalletBalancesViaRpc(wallet);
}

/**
 * Fallback: direct Solana RPC, native SOL only
 */
async function fetchSolanaWalletBalancesViaRpc(
  wallet: WalletConfig
): Promise<AssetBalance[]> {
  try {
    const connection = getConnection();
    const pubkey = new PublicKey(wallet.address);
    const lamports = await connection.getBalance(pubkey);
    const amount = lamports / LAMPORTS_PER_SOL;
    if (amount > 0) {
      return [{ asset: 'SOL', amount, usdValue: 0 }];
    }
  } catch (error) {
    console.error(`Error fetching SOL for ${wallet.name}:`, error);
  }
  return [];
}
