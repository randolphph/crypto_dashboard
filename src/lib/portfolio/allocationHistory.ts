import type { SnapshotPayload } from '@/types/snapshot';

export interface AllocationValue { id: string; label: string; value: number }
export interface AllocationObservation { timestamp: number; allocation?: AllocationValue[]; quality?: 'estimated'; paused?: true }
export const ALLOCATION_HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * ALLOCATION_HOUR_MS;

export function normalizeAllocation(input: unknown): AllocationValue[] | null {
  if (!Array.isArray(input)) return null;
  const ids = new Set<string>();
  const values: AllocationValue[] = [];
  for (const row of input) {
    if (!row || typeof row.id !== 'string' || !row.id || typeof row.label !== 'string' || !Number.isFinite(row.value) || ids.has(row.id)) return null;
    ids.add(row.id);values.push({ id: row.id, label: row.label, value: row.value });
  }
  return values.sort((a, b) => a.id.localeCompare(b.id));
}

export function validAllocationObservation(value: AllocationObservation, now: number): boolean {
  return !!value && Number.isFinite(value.timestamp) && value.timestamp > 0 && value.timestamp <= now + 60000
    && (value.paused === true || normalizeAllocation(value.allocation) !== null);
}

/** Keep first/last observations and pause boundaries per recent hour; older data is daily. */
export function compactAllocationHistory(incoming: AllocationObservation[], now: number): AllocationObservation[] {
  const unique = new Map<number, AllocationObservation>();
  for (const point of incoming) {
    if (!validAllocationObservation(point, now) || point.timestamp < now - 3 * 365 * DAY_MS) continue;
    unique.set(point.timestamp, point.paused ? { timestamp: point.timestamp, paused: true } : {
      timestamp: point.timestamp, allocation: normalizeAllocation(point.allocation)!, ...(point.quality === 'estimated' ? { quality: 'estimated' as const } : {}),
    });
  }
  const recent = new Map<number, AllocationObservation[]>(), daily = new Map<string, AllocationObservation[]>();
  for (const point of [...unique.values()].sort((a, b) => a.timestamp - b.timestamp)) {
    if (point.timestamp >= now - 30 * DAY_MS) {
      const hour = Math.floor(point.timestamp / ALLOCATION_HOUR_MS);
      const group = recent.get(hour) ?? [];group.push(point);recent.set(hour, group);
    } else {
      const day = new Date(point.timestamp), key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
      const group = daily.get(key) ?? [];group.push(point);daily.set(key, group);
    }
  }
  const kept = new Map<number, AllocationObservation>();
  const keep = (point: AllocationObservation | undefined) => { if (point) kept.set(point.timestamp, point); };
  for (const group of recent.values()) {
    const observations = group.filter(point => !point.paused), pauses = group.filter(point => point.paused);
    keep(observations[0]);keep(observations.at(-1));keep(pauses[0]);keep(pauses.at(-1));
  }
  for (const group of daily.values()) {
    const observations = group.filter(point => !point.paused);
    keep(observations.reduce<AllocationObservation | undefined>((best, point) => {
      const date = new Date(point.timestamp), noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime();
      return !best || Math.abs(point.timestamp - noon) < Math.abs(best.timestamp - noon) ? point : best;
    }, undefined));
    keep(group.find(point => point.paused));
  }
  return [...kept.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function shouldRecordAllocation(previous: AllocationObservation | undefined, next: AllocationObservation) {
  if (!previous) return true;
  if (next.paused) return !previous.paused;
  if (previous.paused) return true;
  return previous.quality !== next.quality || JSON.stringify(normalizeAllocation(previous.allocation)) !== JSON.stringify(normalizeAllocation(next.allocation))
    || next.timestamp - previous.timestamp >= ALLOCATION_HOUR_MS;
}

/** Backfill only actual category snapshots belonging to this wallet. Total-only history cannot supply composition. */
export function allocationFromSnapshots(wallet: string, snapshots: SnapshotPayload[]): AllocationObservation[] {
  return snapshots.flatMap(snapshot => {
    if (!snapshot || typeof snapshot.wallet !== 'string' || snapshot.wallet.toLowerCase() !== wallet.toLowerCase()) return [];
    const allocation = normalizeAllocation(snapshot.assetAllocation);
    return allocation ? [{ timestamp: snapshot.timestamp, allocation }] : [];
  });
}
