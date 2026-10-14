import type { LedgerActivity } from '@/types/ledger';

export interface TimelineValue { timestamp: number; value: number }

export function selectTimelineActivities(activities: LedgerActivity[], cutoff: number) {
  return activities.filter((row) => Number.isFinite(row.occurredAt) && row.occurredAt >= cutoff && row.status !== 'cancelled' && row.status !== 'corrected');
}

export function timelineDomain(snapshots: TimelineValue[], tradeTimes: number[]): [number, number] {
  const times = [...snapshots.map((row) => row.timestamp), ...tradeTimes];
  return [Math.min(...times), Math.max(...times)];
}

export function valuationReference(snapshots: TimelineValue[], timestamp: number): number | undefined {
  if (!snapshots.length) return undefined;
  if (timestamp < snapshots[0].timestamp) return snapshots[0].timestamp;
  if (timestamp > snapshots.at(-1)!.timestamp) return snapshots.at(-1)!.timestamp;
  return undefined;
}
