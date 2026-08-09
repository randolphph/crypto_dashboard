import { fetchDeribitData } from '@/lib/exchanges/deribit';
import { fetchPrices } from '@/lib/prices';
import type { AssetBalance } from '@/types/common';
import { enforceRateLimit } from '@/lib/http/guards';

const STABLE_CURRENCIES = new Set(['USDC', 'USDT']);
export const maxDuration = 20;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'exchange:deribit', 30, 60);
  if (limited) return limited;

  const clientId = request.headers.get('x-deribit-client-id') || process.env.DERIBIT_CLIENT_ID;
  const clientSecret = request.headers.get('x-deribit-client-secret') || process.env.DERIBIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json(
      { configured: false },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  try {
    const { positions, accountSummaries, errors } = await fetchDeribitData(
      clientId,
      clientSecret
    );

    // Use total_equity_usd from Deribit (cross-currency portfolio margin total).
    // All summaries are supposed to return the same number; take the largest as
    // a defensive against a per-currency summary lagging cross-portfolio sync.
    const totalUsdValue = Math.max(
      0,
      ...accountSummaries.map((s) => s.total_equity_usd ?? 0)
    );

    // Stablecoins price at 1 USD; only fetch market prices for the volatile
    // currencies actually present in the account.
    const volatileCurrencies = accountSummaries
      .map((s) => s.currency)
      .filter((c) => !STABLE_CURRENCIES.has(c));
    const fetchedPrices = volatileCurrencies.length
      ? await fetchPrices(volatileCurrencies)
      : {};
    const missingPrices = volatileCurrencies.filter(
      (currency) => !(fetchedPrices[currency] > 0)
    );
    const prices: Record<string, number> = { ...fetchedPrices };
    for (const c of STABLE_CURRENCIES) prices[c] = 1;

    const balances: AssetBalance[] = accountSummaries
      .filter((s) => s.margin_balance !== 0)
      .map((s) => ({
        asset: s.currency,
        amount: s.margin_balance,
        usdValue: s.margin_balance * (prices[s.currency] ?? 0),
      }));

    return Response.json(
      {
        positions,
        accountSummaries,
        balances,
        prices,
        totalUsdValue,
        lastUpdated: new Date().toISOString(),
        dataQuality: {
          complete: missingPrices.length === 0 && errors.length === 0,
          errors: [
            ...errors,
            ...missingPrices.map(
              (currency) => `Price unavailable: ${currency}`
            ),
          ],
        },
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
