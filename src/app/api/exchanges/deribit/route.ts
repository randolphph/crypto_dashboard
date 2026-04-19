import { fetchDeribitData } from '@/lib/exchanges/deribit';
import { fetchPrices } from '@/lib/prices';
import type { AssetBalance } from '@/types/common';

export async function GET(request: Request) {
  const clientId = request.headers.get('x-deribit-client-id') || process.env.DERIBIT_CLIENT_ID;
  const clientSecret = request.headers.get('x-deribit-client-secret') || process.env.DERIBIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json({ configured: false });
  }

  try {
    const { positions, accountSummaries } = await fetchDeribitData(clientId, clientSecret);

    // Use total_equity_usd from Deribit (cross-currency portfolio margin total)
    // Both currency summaries return the same total_equity_usd, so take it from the first one
    const totalUsdValue = accountSummaries[0]?.total_equity_usd ?? 0;

    const prices = await fetchPrices(['BTC', 'ETH']);
    const balances: AssetBalance[] = accountSummaries.map((s) => ({
      asset: s.currency,
      amount: s.margin_balance,
      usdValue: s.margin_balance * (prices[s.currency] ?? 0),
    }));

    return Response.json({
      positions,
      accountSummaries,
      balances,
      prices,
      totalUsdValue,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({
      positions: [],
      accountSummaries: [],
      balances: [],
      prices: {},
      totalUsdValue: 0,
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
