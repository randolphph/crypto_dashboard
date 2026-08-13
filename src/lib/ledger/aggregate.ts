import type { LedgerActivity } from '@/types/ledger';

function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * One daily journal row per account / instrument / direction. Option contract
 * fields are deliberately part of the key so contracts never collapse into
 * their underlying stock or into one another.
 */
function dailyKey(activity: LedgerActivity): string | null {
  if (
    activity.kind !== 'trade' ||
    activity.status === 'cancelled' ||
    activity.status === 'corrected'
  ) return null;
  return [
    activity.accountId,
    localDay(activity.occurredAt),
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
}

export function mergeDailyActivities(
  activities: LedgerActivity[]
): LedgerActivity[] {
  const groups = new Map<string, LedgerActivity[]>();
  const standalone: LedgerActivity[] = [];

  for (const activity of activities) {
    const key = dailyKey(activity);
    if (!key) {
      standalone.push(activity);
      continue;
    }
    const entries = groups.get(key);
    if (entries) entries.push(activity);
    else groups.set(key, [activity]);
  }

  const merged = [...groups.entries()].map(([key, entries]) => {
    if (entries.length === 1) return entries[0];
    const sorted = entries.slice().sort((a, b) => a.occurredAt - b.occurredAt);
    const first = sorted[0];
    const quantity = sorted.reduce((sum, activity) => sum + activity.quantity, 0);
    const notional = sorted.reduce(
      (sum, activity) => sum + activity.quantity * activity.price * activity.multiplier,
      0
    );
    const hasCashFlow = sorted.some((activity) => activity.cashFlow !== undefined);
    const sourceExternalIds = [
      ...new Set(
        sorted.flatMap((activity) =>
          activity.sourceExternalIds ??
          (activity.externalId && !activity.externalId.startsWith('daily:')
            ? [activity.externalId]
            : [])
        )
      ),
    ];
    return {
      ...first,
      id: `daily-${key}`,
      occurredAt: first.occurredAt,
      recordedAt: Math.min(...sorted.map((activity) => activity.recordedAt)),
      confirmedAt: sorted.every((activity) => activity.status === 'confirmed')
        ? Math.max(...sorted.map((activity) => activity.confirmedAt ?? 0)) || undefined
        : undefined,
      status: sorted.every((activity) => activity.status === 'confirmed')
        ? 'confirmed'
        : 'provisional',
      quantity,
      price: quantity * first.multiplier > 0 ? notional / (quantity * first.multiplier) : 0,
      commission: sorted.reduce((sum, activity) => sum + activity.commission, 0),
      tax: sorted.reduce((sum, activity) => sum + activity.tax, 0),
      otherFee: sorted.reduce((sum, activity) => sum + activity.otherFee, 0),
      cashFlow: hasCashFlow
        ? sorted.reduce((sum, activity) => sum + (activity.cashFlow ?? 0), 0)
        : undefined,
      // The aggregate itself becomes the stable identity for future imports.
      externalId: `daily:${key}`,
      sourceExternalIds: sourceExternalIds.length > 0 ? sourceExternalIds : undefined,
      note: `日内合并：${sorted.length} 笔成交`,
    } satisfies LedgerActivity;
  });

  return [...standalone, ...merged].sort((a, b) => b.occurredAt - a.occurredAt);
}
