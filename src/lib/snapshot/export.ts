'use client';

import type { SnapshotPayload } from '@/types/snapshot';

function escapeCsv(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const POSITIONS_HEADERS = [
  'timestamp',
  'iso',
  'source',
  'account',
  'symbol',
  'kind',
  'market',
  'qty',
  'priceLocal',
  'currency',
  'valueLocal',
  'valueUsd',
  'pnlLocal',
  'pnlUsd',
  'changePct',
] as const;

const PORTFOLIO_HEADERS = [
  'timestamp',
  'iso',
  'totalUsd',
  'cryptoUsd',
  'stocksUsd',
  'cashUsd',
  'otherUsd',
  'fxCnyUsd',
  'fxHkdUsd',
  'fxKrwUsd',
] as const;

export function snapshotsToPositionsCsv(snapshots: SnapshotPayload[]): string {
  const lines: string[] = [POSITIONS_HEADERS.join(',')];
  for (const snap of snapshots) {
    const iso = new Date(snap.timestamp).toISOString();
    for (const p of snap.positions) {
      lines.push(
        [
          snap.timestamp,
          iso,
          p.source,
          p.account ?? '',
          p.symbol,
          p.kind,
          p.market ?? '',
          p.qty,
          p.priceLocal ?? '',
          p.currency,
          p.valueLocal ?? '',
          p.valueUsd,
          p.pnlLocal ?? '',
          p.pnlUsd ?? '',
          p.changePct ?? '',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
  }
  return lines.join('\n');
}

export function snapshotsToPortfolioCsv(snapshots: SnapshotPayload[]): string {
  const lines: string[] = [PORTFOLIO_HEADERS.join(',')];
  for (const snap of snapshots) {
    const iso = new Date(snap.timestamp).toISOString();
    const pf = snap.portfolio;
    lines.push(
      [
        snap.timestamp,
        iso,
        pf.totalUsd,
        pf.cryptoUsd ?? '',
        pf.stocksUsd ?? '',
        pf.cashUsd ?? '',
        pf.otherUsd ?? '',
        pf.fxCnyUsd ?? '',
        pf.fxHkdUsd ?? '',
        pf.fxKrwUsd ?? '',
      ]
        .map(escapeCsv)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function snapshotsToJson(snapshots: SnapshotPayload[]): string {
  return JSON.stringify(snapshots, null, 2);
}

export function downloadText(
  content: string,
  filename: string,
  mime = 'text/plain'
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Parse imported JSON. Accepts either a single payload or an array. Loosely
// validates that each row has a wallet + timestamp + positions array — enough
// to avoid stuffing garbage into the store.
export function parseSnapshotsJson(text: string): SnapshotPayload[] {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : [data];
  const out: SnapshotPayload[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (
      typeof o.wallet === 'string' &&
      typeof o.timestamp === 'number' &&
      Array.isArray(o.positions) &&
      o.portfolio &&
      typeof o.portfolio === 'object'
    ) {
      out.push(o as unknown as SnapshotPayload);
    }
  }
  return out;
}
