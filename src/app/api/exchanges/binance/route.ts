import { fetchBinanceAllBalances } from '@/lib/exchanges/binance';
import { fetchPrices } from '@/lib/prices';

const MIN_USD_VALUE = 10;

export async function GET(request: Request) {
  const apiKey = request.headers.get('x-binance-api-key') || process.env.BINANCE_API_KEY;
  const apiSecret = request.headers.get('x-binance-api-secret') || process.env.BINANCE_API_SECRET;
  const enableGridBot =
    request.headers.get('x-binance-enable-grid-bot') === 'true' ||
    process.env.BINANCE_ENABLE_GRID_BOT === 'true';

  if (!apiKey || !apiSecret) {
    return Response.json({ configured: false });
  }

  try {
    const { accounts, futuresPositions, gridBots } = await fetchBinanceAllBalances(
      apiKey,
      apiSecret,
      enableGridBot
    );

    // Collect all unique symbols
    const allSymbols = [
      ...new Set(accounts.flatMap((a) => a.balances.map((b) => b.asset))),
    ];
    const prices = allSymbols.length > 0 ? await fetchPrices(allSymbols) : {};

    // Add USD values, filter < $10, surface sub-account errors
    const accountsWithUsd = accounts
      .map((account) => {
        const balances = account.balances
          .map((b) => ({
            ...b,
            usdValue: b.amount * (prices[b.asset] ?? 0),
          }))
          .filter((b) => b.usdValue >= MIN_USD_VALUE);
        return {
          label: account.label,
          balances,
          totalUsdValue: balances.reduce((sum, b) => sum + b.usdValue, 0),
          error: account.error,
        };
      })
      .filter((a) => a.balances.length > 0 || a.error);

    const totalUsdValue = accountsWithUsd.reduce(
      (sum, a) => sum + a.totalUsdValue,
      0
    );

    return Response.json({
      exchange: 'Binance',
      accounts: accountsWithUsd,
      futuresPositions,
      gridBots,
      balances: accountsWithUsd.flatMap((a) => a.balances),
      totalUsdValue,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({
      exchange: 'Binance',
      accounts: [],
      futuresPositions: [],
      gridBots: [],
      balances: [],
      totalUsdValue: 0,
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
