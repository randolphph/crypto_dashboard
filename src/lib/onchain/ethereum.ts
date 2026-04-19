import 'server-only';
import { createPublicClient, http, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import type { AssetBalance } from '@/types/common';
import type { EvmChain, WalletConfig } from '@/types/onchain';
import { isOkxWeb3Available, fetchEvmBalancesViaOkx, type OkxWeb3Creds } from './okxWeb3';

function getClient() {
  const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
}

/**
 * Primary entry: try OKX Web3 API first, fall back to Ethereum-only RPC.
 */
export async function fetchEvmWalletBalances(
  wallet: WalletConfig,
  chains: EvmChain[],
  okxWeb3Creds?: OkxWeb3Creds
): Promise<AssetBalance[]> {
  if (isOkxWeb3Available(okxWeb3Creds)) {
    try {
      return await fetchEvmBalancesViaOkx(wallet.address, chains, okxWeb3Creds);
    } catch (error) {
      console.warn(
        `OKX Web3 API failed for ${wallet.name}, falling back to RPC:`,
        error
      );
    }
  }

  // RPC fallback: only Ethereum mainnet, native ETH only
  if (chains.includes('ethereum')) {
    return fetchEthNativeBalance(wallet.address);
  }

  return [];
}

async function fetchEthNativeBalance(address: string): Promise<AssetBalance[]> {
  try {
    const client = getClient();
    const balance = await client.getBalance({
      address: address as `0x${string}`,
    });
    const amount = parseFloat(formatUnits(balance, 18));
    if (amount > 0) {
      return [{ asset: 'ETH', amount, usdValue: 0 }];
    }
  } catch (error) {
    console.error(`Error fetching ETH for ${address}:`, error);
  }
  return [];
}
