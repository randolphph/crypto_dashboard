import { fetchEvmWalletBalances } from '@/lib/onchain/ethereum';
import { fetchSolanaWalletBalances } from '@/lib/onchain/solana';
import { fetchBitcoinWalletBalances } from '@/lib/onchain/bitcoin';
import { fetchPrices } from '@/lib/prices';
import type { WalletConfig, Chain, EvmChain } from '@/types/onchain';
import type { WalletBalance } from '@/types/onchain';

function getWalletChains(wallet: WalletConfig): Chain[] {
  // Backward compat: migrate legacy `network` field
  if (wallet.chains?.length) return wallet.chains;
  if (wallet.network) return [wallet.network];
  return ['ethereum'];
}

export async function POST(request: Request) {
  try {
    const { wallets } = (await request.json()) as { wallets: WalletConfig[] };

    if (!wallets || wallets.length === 0) {
      return Response.json([]);
    }

    const results: WalletBalance[] = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const chains = getWalletChains(wallet);
          const isSolana = chains.includes('solana');
          const isBitcoin = chains.includes('bitcoin');
          const evmChains = chains.filter((c) => c !== 'solana' && c !== 'bitcoin') as EvmChain[];

          const balancePromises: Promise<import('@/types/common').AssetBalance[]>[] = [];

          if (isSolana) {
            balancePromises.push(fetchSolanaWalletBalances(wallet));
          }
          if (isBitcoin) {
            balancePromises.push(fetchBitcoinWalletBalances(wallet));
          }
          if (evmChains.length > 0) {
            balancePromises.push(fetchEvmWalletBalances(wallet, evmChains));
          }

          const results = await Promise.all(balancePromises);
          const balances = results.flat();

          // Fetch prices only for assets without USD values (RPC fallback)
          const needsPricing = balances.filter((b) => !b.usdValue);
          const symbols = needsPricing.map((b) => b.asset);
          const prices = symbols.length > 0 ? await fetchPrices(symbols) : {};

          const balancesWithUsd = balances
            .map((b) => ({
              ...b,
              usdValue: b.usdValue || b.amount * (prices[b.asset] ?? 0),
            }))
            .filter((b) => b.usdValue >= 1);

          const totalUsdValue = balancesWithUsd.reduce(
            (sum, b) => sum + b.usdValue,
            0
          );

          return {
            walletId: wallet.id,
            walletName: wallet.name,
            address: wallet.address,
            chains,
            balances: balancesWithUsd,
            totalUsdValue,
          };
        } catch (error) {
          return {
            walletId: wallet.id,
            walletName: wallet.name,
            address: wallet.address,
            chains: getWalletChains(wallet),
            balances: [],
            totalUsdValue: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return Response.json(results);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
