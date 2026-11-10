'use client';

import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { derivePositionLimit, parsePositionLimitPercent } from '@/lib/accumulation/positionLimit';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { cn } from '@/lib/utils';

const percent = (value: number) => value.toLocaleString('zh-CN', { style: 'percent', maximumSignificantDigits: 4 });

export function PositionLimitCell({ symbol, currentValue, totalPortfolioUsd, limitShare, onChange }: {
  symbol: string; currentValue: number; totalPortfolioUsd: number; limitShare?: number;
  onChange: (share: number | undefined) => void;
}) {
  const { percentHidden } = usePrivacyFormat();
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(''), [error, setError] = useState('');
  const finished = useRef(false);
  const { currentShare, limitShare: limit, usage } = derivePositionLimit(currentValue, totalPortfolioUsd, limitShare);
  const shown = (value: number | null) => percentHidden ? '**%' : value === null ? '—' : percent(value);
  const begin = () => { finished.current = false; setDraft(limit !== null ? String(Number((limit * 100).toPrecision(12))) : ''); setError(''); setEditing(true); };
  const save = () => {
    if (finished.current) return;
    try { const next = parsePositionLimitPercent(draft); onChange(next); finished.current = true; setError(''); setEditing(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '上限保存失败'); }
  };
  return <div className="mx-auto min-w-32 max-w-48" data-position-limit={symbol}>
    <div className="flex min-h-8 items-center justify-center px-1 py-1">
      {editing ? <label className="relative inline-flex items-center justify-center gap-1">
        <input autoFocus aria-label={`${symbol} 仓位上限百分比`} aria-invalid={!!error} type="number" min="0" max="100" step="any" placeholder="留空清除" value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={save} onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); save(); }
          if (event.key === 'Escape') { event.preventDefault(); finished.current = true; setEditing(false); setError(''); }
        }} className="w-20 rounded border bg-background px-1 py-0.5 text-center text-xs tabular-nums outline-none focus:ring-1 focus:ring-primary" />%
      </label> : <button type="button" aria-label={`设置 ${symbol} 仓位上限`} onClick={begin} className="relative inline-flex w-full flex-col items-center justify-center gap-0.5 rounded text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="inline-flex items-center justify-center gap-1">
          {limit === null ? '设置上限' : <>{shown(currentShare)} / {shown(limit)}</>}<Pencil className="h-2.5 w-2.5 text-muted-foreground" />
        </span>
        {(limit === null || usage === null || usage > 1) && <span className={cn('text-[10px]', usage !== null && usage > 1 ? 'text-negative' : 'text-muted-foreground')}>
          {limit === null ? `当前 ${shown(currentShare)}` : usage === null ? '当前仓位待估值' : '超限'}
        </span>}
      </button>}
    </div>
    {error && <p role="alert" className="mt-1 max-w-56 whitespace-normal text-[10px] text-negative">{error}</p>}
  </div>;
}
