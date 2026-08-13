import type { IbkrExecution } from '@/types/ibkr';
import type { LedgerActivity } from '@/types/ledger';
import { readApiError } from '@/lib/fetchError';

export function ibkrExecutionsToActivities(
  trades: IbkrExecution[],
  accountId: string
): LedgerActivity[] {
  const executions = trades
    .map((trade): LedgerActivity | null => {
      // The API intentionally leaves the Flex datetime timezone-free. Parsing
      // it here preserves the browser's local timezone instead of imposing the
      // server's (often UTC) timezone on a user's execution history.
      const occurredAt = new Date(trade.occurredAt).getTime();
      if (!Number.isFinite(occurredAt)) return null;
      return {
        id: `ibkr-${trade.externalId}`,
        accountId,
        kind: 'trade',
        occurredAt,
        recordedAt: Date.now(),
        confirmedAt: Date.now(),
        instrumentType: trade.instrumentType,
        market: trade.market,
        symbol: trade.symbol,
        name: trade.name,
        underlying: trade.underlying,
        expiry: trade.expiry,
        strike: trade.strike,
        optionType: trade.optionType,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        currency: trade.currency,
        multiplier: trade.multiplier,
        commission: trade.commission,
        tax: 0,
        otherFee: 0,
        cashFlow: trade.cashFlow,
        status: 'confirmed',
        source: 'api',
        externalId: trade.externalId,
        note: trade.note,
        operation: 'trade',
      };
    })
    .filter((activity): activity is LedgerActivity => activity !== null);

  // Flex reports one row per execution. For the daily journal, partial fills
  // of the same instrument in the same direction are one investment action.
  // Keep option contracts distinct by their full contract identity.
  const grouped = new Map<string, LedgerActivity[]>();
  for (const activity of executions) {
    const occurred = new Date(activity.occurredAt);
    const date = [
      occurred.getFullYear(),
      String(occurred.getMonth() + 1).padStart(2, '0'),
      String(occurred.getDate()).padStart(2, '0'),
    ].join('-');
    const key = [
      date,
      activity.instrumentType,
      activity.market,
      activity.symbol,
      activity.underlying ?? '',
      activity.expiry ?? '',
      activity.strike ?? '',
      activity.optionType ?? '',
      activity.side,
      activity.currency,
      activity.multiplier,
    ].join('|');
    const entries = grouped.get(key);
    if (entries) entries.push(activity);
    else grouped.set(key, [activity]);
  }

  return [...grouped.entries()].map(([key, entries]) => {
    if (entries.length === 1) return entries[0];
    const first = entries[0];
    const quantity = entries.reduce((sum, activity) => sum + activity.quantity, 0);
    const notional = entries.reduce(
      (sum, activity) => sum + activity.quantity * activity.price * activity.multiplier,
      0
    );
    const commission = entries.reduce((sum, activity) => sum + activity.commission, 0);
    const cashFlow = entries.reduce((sum, activity) => sum + (activity.cashFlow ?? 0), 0);
    return {
      ...first,
      id: `ibkr-daily-${key}`,
      occurredAt: Math.min(...entries.map((activity) => activity.occurredAt)),
      quantity,
      price: quantity * first.multiplier > 0 ? notional / (quantity * first.multiplier) : 0,
      commission,
      cashFlow,
      // One day/instrument/direction identity means re-running the same
      // Last Business Day query remains idempotent after aggregation.
      externalId: `ibkr:daily:${key}`,
      note: `IBKR 日内合并：${entries.length} 笔执行`,
    };
  });
}

async function readIbkrActivities(
  response: Response,
  accountId: string,
  label: string
): Promise<LedgerActivity[]> {
  if (!response.ok) throw await readApiError(response, label);
  const body = (await response.json()) as { trades?: IbkrExecution[] };
  return ibkrExecutionsToActivities(body.trades ?? [], accountId);
}

export async function fetchIbkrActivities(
  headers: Record<string, string>,
  accountId: string
): Promise<LedgerActivity[]> {
  return readIbkrActivities(
    await fetch('/api/ibkr/trades', { headers }),
    accountId,
    'IBKR 成交同步'
  );
}

export async function parseIbkrFlexXml(
  xml: string,
  accountId: string
): Promise<LedgerActivity[]> {
  return readIbkrActivities(
    await fetch('/api/ibkr/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
    }),
    accountId,
    'IBKR Flex XML 导入'
  );
}
