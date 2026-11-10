'use client';

import { Pencil } from 'lucide-react';
import { derivePositionLimit } from '@/lib/accumulation/positionLimit';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { cn } from '@/lib/utils';

const percent = (value: number) => value.toLocaleString('zh-CN', { style: 'percent', maximumSignificantDigits: 4 });

export function PositionLimitCell({ symbol, currentValue, totalPortfolioUsd, limitShare, onOpenSettings }: {
  symbol: string; currentValue: number; totalPortfolioUsd: number; limitShare?: number;
  onOpenSettings: () => void;
}) {
  const { percentHidden } = usePrivacyFormat();
  const { currentShare, limitShare: limit, usage } = derivePositionLimit(currentValue, totalPortfolioUsd, limitShare);
  const shown = (value: number | null) => percentHidden ? '**%' : value === null ? '—' : percent(value);
  return <div className="mx-auto min-w-32 max-w-48" data-position-limit={symbol}>
    <div className="flex min-h-8 items-center justify-center px-1 py-1">
      <button type="button" aria-label={`设置 ${symbol} 仓位上限`} onClick={onOpenSettings} className="relative inline-flex w-full flex-col items-center justify-center gap-0.5 rounded text-xs tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="inline-flex items-center justify-center gap-1">
          {limit === null ? '设置上限' : <>{shown(currentShare)} / {shown(limit)}</>}<Pencil className="h-2.5 w-2.5 text-muted-foreground" />
        </span>
        {(limit === null || usage === null || usage > 1) && <span className={cn('text-[10px]', usage !== null && usage > 1 ? 'text-negative' : 'text-muted-foreground')}>
          {limit === null ? `当前 ${shown(currentShare)}` : usage === null ? '当前仓位待估值' : '超限'}
        </span>}
      </button>
    </div>
  </div>;
}
