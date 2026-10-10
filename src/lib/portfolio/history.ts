export interface PortfolioSnapshot {
  timestamp: number;
  value: number;
  quality?: 'estimated';
  warnings?: string[];
}

export interface HistorySource {
  label: string;
  required: boolean;
  value?: number;
  usable?: boolean;
  loading?: boolean;
  error?: string | null;
  warnings?: string[];
  dataQuality?: { complete: boolean; errors: string[] };
}

export interface HistoryRecording {
  canRecord: boolean;
  status: 'ready' | 'estimated' | 'loading' | 'blocked';
  warnings: string[];
  blockers: string[];
}

// Curve observations describe the valuation shown on the dashboard. A cached
// or partial valuation has provenance; an absent valuation must never become 0.
// Detailed position snapshots keep their separate, stricter completeness gate.
export function assessHistoryRecording({ totalValue, sources }: { totalValue: number; sources: HistorySource[] }): HistoryRecording {
  const warnings: string[] = [];
  const blockers: string[] = [];
  let loading = false;
  for (const source of sources) {
    if (!source.required) continue;
    if (source.loading) { loading = true; continue; }
    if (!Number.isFinite(source.value) || source.usable === false || (source.dataQuality?.complete === false && source.value === 0)) {
      blockers.push(`${source.label}：${source.error || source.dataQuality?.errors.join('；') || '尚无可用估值'}`);
      continue;
    }
    if (source.error) warnings.push(`${source.label}：${source.error}，使用上次可用估值`);
    source.warnings?.forEach((warning) => warnings.push(`${source.label}：${warning}`));
    if (source.dataQuality?.complete === false) {
      const reasons = source.dataQuality.errors.length ? source.dataQuality.errors : ['部分数据不可用'];
      reasons.forEach((reason) => warnings.push(`${source.label}：${reason}`));
    }
  }
  if (!loading && (!Number.isFinite(totalValue) || totalValue <= 0)) blockers.push('组合总值尚不可用');
  const status = blockers.length > 0 ? 'blocked' : loading ? 'loading' : warnings.length > 0 ? 'estimated' : 'ready';
  return { canRecord: status === 'ready' || status === 'estimated', status, warnings: [...new Set(warnings)], blockers };
}

export function shouldRecordHistory(previous: PortfolioSnapshot | undefined, next: Omit<PortfolioSnapshot, 'timestamp'>, now: number) {
  return !previous || previous.value !== next.value || previous.quality !== next.quality ||
    JSON.stringify(previous.warnings ?? []) !== JSON.stringify(next.warnings ?? []) ||
    now - previous.timestamp >= 60 * 60 * 1000;
}

function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportHistoryCsv(snapshots: PortfolioSnapshot[]) {
  return ['timestamp,date,value_usd,quality,warnings', ...snapshots.slice().sort((a, b) => a.timestamp - b.timestamp).map((row) => (
    [String(row.timestamp), new Date(row.timestamp).toISOString(), String(row.value), row.quality ?? '', row.warnings ? JSON.stringify(row.warnings) : ''].map(csvField).join(',')
  ))].join('\n');
}

export function parseHistoryCsv(text: string): PortfolioSnapshot[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === ',') { row.push(field); field = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      row.push(field); rows.push(row); row = []; field = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.slice(1).flatMap((cols): PortfolioSnapshot[] => {
    const timestamp = Number(cols[0]), value = Number(cols[2]);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(new Date(timestamp).getTime()) || !Number.isFinite(value) || !cols[2]?.trim()) return [];
    const snapshot: PortfolioSnapshot = { timestamp, value };
    if (cols[3] === 'estimated') {
      snapshot.quality = 'estimated';
      try {
        const warnings: unknown = JSON.parse(cols[4] ?? '[]');
        if (Array.isArray(warnings)) snapshot.warnings = warnings.filter((warning): warning is string => typeof warning === 'string');
      } catch { /* Keep the estimate flag even when a CSV warning cell is invalid. */ }
    }
    return [snapshot];
  });
}
