import { fetchBinanceAllBalances } from '@/lib/exchanges/binance';
import { fetchPrices } from '@/lib/prices';
import { fetchBinanceEquityPrices, isBinanceEquityAsset } from '@/lib/exchanges/binanceEquity';
import { enforceRateLimit } from '@/lib/http/guards';
import { MIN_ASSET_USD_VALUE } from '@/lib/portfolio/assetDust';

export const maxDuration = 20;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'exchange:binance', 30, 60);
  if (limited) return limited;

  const apiKey = request.headers.get('x-binance-api-key') || process.env.BINANCE_API_KEY;
  const apiSecret = request.headers.get('x-binance-api-secret') || process.env.BINANCE_API_SECRET;
  const enableGridBot =
    request.headers.get('x-binance-enable-grid-bot') === 'true' ||
    process.env.BINANCE_ENABLE_GRID_BOT === 'true';

  if (!apiKey || !apiSecret) {
    return Response.json(
      { configured: false },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
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
    const cryptoSymbols = allSymbols.filter((symbol) => !isBinanceEquityAsset(symbol));
    const equitySymbols = allSymbols.filter(isBinanceEquityAsset);
    const [cryptoPrices, equityPrices] = await Promise.all([
      cryptoSymbols.length > 0 ? fetchPrices(cryptoSymbols) : {},
      equitySymbols.length > 0 ? fetchBinanceEquityPrices(equitySymbols, apiKey) : {},
    ]);
    const prices: Record<string, number> = { ...cryptoPrices, ...equityPrices };
    const missingPrices = allSymbols.filter((symbol) => !(prices[symbol] > 0));
    const unpriced = new Set(missingPrices);
    const accountErrors = accounts
      .filter((account) => !!account.error)
      .map((account) => `${account.label}: ${account.error}`);

    // Price before filtering: a missing quote does not prove a holding is dust.
    const accountsWithUsd = accounts
      .map((account) => {
        const balances = account.balances
          .map((b) => ({
            ...b,
            usdValue: b.amount * (prices[b.asset] ?? 0),
            ...(unpriced.has(b.asset) ? { valuationIncomplete: true } : {}),
          }))
          .filter((b) => b.valuationIncomplete || b.usdValue >= MIN_ASSET_USD_VALUE);
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

    return Response.json(
      {
        exchange: 'Binance',
        accounts: accountsWithUsd,
        futuresPositions,
        gridBots,
        balances: accountsWithUsd.flatMap((a) => a.balances),
        totalUsdValue,
        lastUpdated: new Date().toISOString(),
        dataQuality: {
          complete: missingPrices.length === 0 && accountErrors.length === 0,
          errors: [
            ...accountErrors,
            ...missingPrices.map((symbol) => `Price unavailable: ${symbol}`),
          ],
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
