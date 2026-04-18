import 'server-only';
import { createPublicClient, http, erc20Abi, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import type { AssetBalance } from '@/types/common';
import type { WalletConfig } from '@/types/onchain';

function getClient() {
  const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
}

export async function fetchEthereumWalletBalances(
  wallet: WalletConfig
): Promise<AssetBalance[]> {
  const client = getClient();
  const address = wallet.address as `0x${string}`;
  const balances: AssetBalance[] = [];

  for (const token of wallet.trackedTokens) {
    try {
      if (!token.contractAddress) {
        // Native ETH
        const balance = await client.getBalance({ address });
        const amount = parseFloat(formatUnits(balance, 18));
        if (amount > 0) {
          balances.push({ asset: token.symbol, amount, usdValue: 0 });
        }
      } else {
        // ERC-20
        const balance = await client.readContract({
          address: token.contractAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        });
        const amount = parseFloat(formatUnits(balance, token.decimals));
        if (amount > 0) {
          balances.push({ asset: token.symbol, amount, usdValue: 0 });
        }
      }
    } catch (error) {
      console.error(
        `Error fetching ${token.symbol} for ${wallet.name}:`,
        error
      );
    }
  }

  return balances;
}
