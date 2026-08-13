import type { BinanceExecution } from '@/types/binance';
import type { LedgerActivity } from '@/types/ledger';
import { readApiError } from '@/lib/fetchError';

function isQuoteCurrencyFee(trade: BinanceExecution): boolean {
  return trade.commissionAsset.toUpperCase() === trade.quoteAsset.toUpperCase();
}

export function binanceExecutionsToActivities(
  executions: BinanceExecution[],
  accountId: string
): LedgerActivity[] {
  return executions.map((trade) => {
    const commissionInQuote = isQuoteCurrencyFee(trade) ? trade.commission : 0;
    const gross = trade.quoteQuantity ?? trade.quantity * trade.price;
    const note = !commissionInQuote && trade.commission > 0
      ? `Binance 手续费：${trade.commission} ${trade.commissionAsset}`
      : undefined;
    return {
      id: `binance-${trade.market}-${trade.externalId}`,
      accountId,
      kind: 'trade',
      occurredAt: trade.timestamp,
      recordedAt: Date.now(),
      confirmedAt: Date.now(),
      instrumentType:
        trade.market === 'spot'
          ? 'crypto_spot'
          : trade.market === 'coinm' && !trade.symbol.endsWith('_PERP')
            ? 'future'
            : 'crypto_perp',
      market:
        trade.market === 'spot'
          ? 'Binance Spot'
          : trade.market === 'usdm'
            ? 'Binance USD-M'
            : 'Binance COIN-M',
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      currency: trade.quoteAsset,
      multiplier: 1,
      commission: commissionInQuote,
      tax: 0,
      otherFee: 0,
      // Coin-M `qty` is a contract count, so reporting a synthetic cash flow
      // from qty × price would be misleading without contract-size metadata.
      cashFlow: trade.isContractQuantity
        ? undefined
        : trade.side === 'buy'
          ? -gross - commissionInQuote
          : gross - commissionInQuote,
      status: 'confirmed',
      source: 'api',
      externalId: trade.externalId,
      sourceExternalIds: [trade.externalId],
      note,
      operation: 'trade',
    };
  });
}

export async function fetchBinanceActivities(
  headers: Record<string, string>,
  accountId: string,
  since: number
): Promise<LedgerActivity[]> {
  const response = await fetch(`/api/binance/trades?since=${encodeURIComponent(since)}`, {
    headers,
  });
  if (!response.ok) throw await readApiError(response, 'Binance 成交同步');
  const body = (await response.json()) as { executions?: BinanceExecution[] };
  return binanceExecutionsToActivities(body.executions ?? [], accountId);
}
