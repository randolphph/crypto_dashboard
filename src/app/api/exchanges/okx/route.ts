import { fetchOkxBalances } from '@/lib/exchanges/okx';
import { fetchPrices } from '@/lib/prices';

export async function GET() {
  try {
    const balances = await fetchOkxBalances();

    // OKX already returns eq (USD equivalent) for some assets
    // For those without, fetch prices
    const needsPrice = balances.filter((b) => b.usdValue === 0);
    if (needsPrice.length > 0) {
      const prices = await fetchPrices(needsPrice.map((b) => b.asset));
      for (const b of balances) {
        if (b.usdValue === 0) {
          b.usdValue = b.amount * (prices[b.asset] ?? 0);
        }
      }
    }

    const filtered = balances.filter((b) => b.usdValue >= 10);
    const totalUsdValue = filtered.reduce((sum, b) => sum + b.usdValue, 0);

    return Response.json({
      exchange: 'OKX',
      balances: filtered,
      totalUsdValue,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({
      exchange: 'OKX',
      balances: [],
      totalUsdValue: 0,
      lastUpdated: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
