import { fetchOkxBalances } from '@/lib/exchanges/okx';
import { fetchPrices } from '@/lib/prices';

export async function GET(request: Request) {
  const apiKey = request.headers.get('x-okx-api-key') || process.env.OKX_API_KEY;
  const apiSecret = request.headers.get('x-okx-api-secret') || process.env.OKX_API_SECRET;
  const passphrase = request.headers.get('x-okx-passphrase') || process.env.OKX_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    return Response.json({ configured: false });
  }

  try {
    const balances = await fetchOkxBalances(apiKey, apiSecret, passphrase);

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
