import { CHART_SERIES } from '@/lib/theme/colors';
import { validAllocationObservation, type AllocationObservation } from './allocationHistory';

export type AllocationStreamMode = 'amount' | 'share';
export interface StreamCategory { id: string; label: string; color?: string }
interface StreamPoint { timestamp: number; allocation: NonNullable<AllocationObservation['allocation']>; quality?: 'estimated'; total: number; values: number[] }

/** Real observations only: no inference from total-only history and no synthetic dates. */
export function buildAllocationStream(history: AllocationObservation[], categories: StreamCategory[], fromTs: number, mode: AllocationStreamMode, now = Date.now()) {
  const records = history.filter(point => validAllocationObservation(point, now) && point.timestamp >= fromTs && point.timestamp <= now).sort((a, b) => a.timestamp - b.timestamp);
  const scores = new Map<string, { label: string; total: number }>();
  for (const point of records) for (const row of point.allocation ?? []) {
    const previous = scores.get(row.id) ?? { label: row.label, total: 0 };
    previous.label = row.label;previous.total += Math.max(0, row.value);scores.set(row.id, previous);
  }
  const ordered = [...scores].filter(([, row]) => row.total > 0).sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  const grouped = ordered.length > 5;
  const selected = ordered.slice(0, grouped ? 4 : 5);
  const selectedIds = new Set(selected.map(([id]) => id));
  const series = selected.map(([id, row], index) => ({ id, label: categories.find(category => category.id === id)?.label ?? row.label,
    color: categories.find(category => category.id === id)?.color ?? CHART_SERIES[index % CHART_SERIES.length], other: false }));
  if (grouped) series.push({ id: '__allocation_other__', label: '其他', color: CHART_SERIES[4 % CHART_SERIES.length], other: true });
  const segments: StreamPoint[][] = [];
  let segment: StreamPoint[] = [];
  const points: StreamPoint[] = [];
  for (const record of records) {
    if (record.paused) { if (segment.length) segments.push(segment);segment = [];continue; }
    const allocation = record.allocation!;
    const total = allocation.reduce((sum, row) => sum + Math.max(0, row.value), 0);
    const values = series.map(category => allocation.reduce((sum, row) => sum + (category.other ? !selectedIds.has(row.id) ? Math.max(0, row.value) : 0 : row.id === category.id ? Math.max(0, row.value) : 0), 0));
    const point: StreamPoint = { timestamp: record.timestamp, allocation, quality: record.quality, total,
      values: mode === 'share' ? values.map(value => total > 0 ? value / total * 100 : 0) : values };
    points.push(point);segment.push(point);
  }
  if (segment.length) segments.push(segment);
  return { series, points, segments, from: records[0]?.timestamp ?? now, to: records.at(-1)?.timestamp ?? now,
    maxTotal: mode === 'share' ? 100 : Math.max(0, ...points.map(point => point.total)) };
}

export function streamGeometry(model: ReturnType<typeof buildAllocationStream>, width: number, height = 100) {
  const left = 8, right = Math.max(left + 1, width - 8), center = 40, scale = model.maxTotal > 0 ? 64 / model.maxTotal : 0;
  const x = (timestamp: number) => left + (timestamp - model.from) / Math.max(1, model.to - model.from) * (right - left);
  const smooth = (points: Array<[number, number]>) => {
    let path = `M${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
    // Midpoint leads make this curve identical in either traversal direction;
    // adjacent bands must share exactly the same smoothed boundary.
    if (points.length > 2) path += ` L${((points[0][0] + points[1][0]) / 2).toFixed(2)} ${((points[0][1] + points[1][1]) / 2).toFixed(2)}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], q = points[i + 1];
      path += ` Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${((p[0] + q[0]) / 2).toFixed(2)} ${((p[1] + q[1]) / 2).toFixed(2)}`;
    }
    return `${path} L${points.at(-1)![0].toFixed(2)} ${points.at(-1)![1].toFixed(2)}`;
  };
  const bands = model.series.map((category, index) => {
    const paths: string[] = [];
    let label: { x: number; y: number; thickness: number } | null = null;
    for (const segment of model.segments) {
      if (segment.length < 2) continue;
      const top: Array<[number, number]> = [], bottom: Array<[number, number]> = [];
      for (const point of segment) {
        const total = point.values.reduce((sum, value) => sum + value, 0);
        const y0 = center - total * scale / 2 + point.values.slice(0, index).reduce((sum, value) => sum + value, 0) * scale;
        const thickness = point.values[index] * scale, px = x(point.timestamp);
        top.push([px, y0]);bottom.push([px, y0 + thickness]);
        const margin = category.label.length * 5 + 8;
        if (px > margin && px < width - margin && thickness >= 12 && (!label || thickness > label.thickness)) label = { x: px, y: y0 + thickness / 2, thickness };
      }
      paths.push(`${smooth(top)} ${smooth([...bottom].reverse()).replace(/^M/, 'L')} Z`);
    }
    return { ...category, paths, labelPosition: label };
  });
  const tickCount = Math.min(48, model.points.length);
  const ticks = Array.from({ length: tickCount }, (_, index) => model.points[Math.round(index / Math.max(1, tickCount - 1) * (model.points.length - 1))]).map(point => ({ timestamp: point.timestamp, x: x(point.timestamp) }));
  return { bands, ticks, x, baseline: height - 17 };
}
