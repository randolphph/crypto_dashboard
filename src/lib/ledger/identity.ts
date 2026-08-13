import type { LedgerActivity } from '@/types/ledger';

// Used when an upstream platform does not provide a stable execution id.
// Account and complete instrument identity are included so similarly named
// options or trades on different venues never collide.
export function activityFingerprint(activity: Pick<
  LedgerActivity,
  | 'accountId'
  | 'occurredAt'
  | 'instrumentType'
  | 'market'
  | 'symbol'
  | 'underlying'
  | 'expiry'
  | 'strike'
  | 'optionType'
  | 'side'
  | 'quantity'
  | 'price'
>): string {
  return [
    activity.accountId,
    activity.occurredAt,
    activity.instrumentType,
    activity.market.trim().toUpperCase(),
    activity.symbol.trim().toUpperCase(),
    activity.underlying?.trim().toUpperCase() ?? '',
    activity.expiry ?? '',
    activity.strike ?? '',
    activity.optionType ?? '',
    activity.side,
    activity.quantity,
    activity.price,
  ].join('|');
}

