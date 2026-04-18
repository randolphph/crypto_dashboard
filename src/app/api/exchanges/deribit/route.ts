import { fetchDeribitData } from '@/lib/exchanges/deribit';
import { fetchPrices } from '@/lib/prices';
import type { AssetBalance } from '@/types/common';

export async function GET() {
  try {
    const { positions, accountSummaries } = await fetchDeribitData();

    // Calculate total USD value from account equity
    const prices = await fetchPrices(['BTC', 'ETH']);
    const balances: AssetBalance[] = accountSummaries.map((s) => ({
      asset: s.currency,
      amount: s.equity,
      usdValue: s.equity * (prices[s.currency] ?? 0),
    }));

    const totalUsdValue = balances.reduce((sum, b) => sum + b.usdValue, 0);

    return Response.json({
      positions,
      accountSummaries,
      balances,
      totalUsdValue,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({
      positions: [],
      accountSummaries: [],
      balances: [],
      totalUsdValue: 0,
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
