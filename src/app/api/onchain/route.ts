import { fetchEthereumWalletBalances } from '@/lib/onchain/ethereum';
import { fetchSolanaWalletBalances } from '@/lib/onchain/solana';
import { fetchPrices } from '@/lib/prices';
import type { WalletConfig } from '@/types/onchain';
import type { WalletBalance } from '@/types/onchain';

export async function POST(request: Request) {
  try {
    const { wallets } = (await request.json()) as { wallets: WalletConfig[] };

    if (!wallets || wallets.length === 0) {
      return Response.json([]);
    }

    const results: WalletBalance[] = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const balances =
            wallet.network === 'ethereum'
              ? await fetchEthereumWalletBalances(wallet)
              : await fetchSolanaWalletBalances(wallet);

          // Fetch prices
          const symbols = balances.map((b) => b.asset);
          const prices = symbols.length > 0 ? await fetchPrices(symbols) : {};

          const balancesWithUsd = balances.map((b) => ({
            ...b,
            usdValue: b.amount * (prices[b.asset] ?? 0),
          }));

          const totalUsdValue = balancesWithUsd.reduce(
            (sum, b) => sum + b.usdValue,
            0
          );

          return {
            walletId: wallet.id,
            walletName: wallet.name,
            address: wallet.address,
            network: wallet.network,
            balances: balancesWithUsd,
            totalUsdValue,
          };
        } catch (error) {
          return {
            walletId: wallet.id,
            walletName: wallet.name,
            address: wallet.address,
            network: wallet.network,
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
