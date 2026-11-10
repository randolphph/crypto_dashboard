'use client';

import { Activity, useState } from 'react';
import { ChartNoAxesCombined, List, Settings2 } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { TargetTable } from './TargetTable';
import { TargetStackedRungsChart } from './TargetStackedRungsChart';
import type { DerivedTarget } from '@/lib/accumulation/derive';
import { cn } from '@/lib/utils';
import { getPositionBudget } from '@/lib/accumulation/positionLimit';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';

export function TargetHoldings(props: {
  derived: DerivedTarget[]; sectorColors: ReadonlyMap<string, string>; activeSector?: string | null;
  totalPortfolioUsd: number; targetPortfolioShare: number; onOpenSettings: (id?: string) => void; onDelete: (id: string) => void;
}) {
  const view = useDashboardStore(s => s.aiHoldingsView);
  const setView = useDashboardStore(s => s.setAiHoldingsView);
  const [activationKey, setActivationKey] = useState(0);
  const { percentHidden } = usePrivacyFormat();
  const budget = getPositionBudget(props.derived.map(row => row.target), props.targetPortfolioShare);
  const pct = (value: number) => percentHidden ? '**%' : value.toLocaleString('zh-CN', { style: 'percent', maximumSignificantDigits: 6 });
  return <section aria-label="AI 仓位持仓展示" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p data-position-budget role={budget.overBudget ? 'alert' : 'status'} className={cn('text-xs tabular-nums', budget.overBudget ? 'text-negative' : 'text-muted-foreground')}>
        已分配 <span className="font-medium">{pct(budget.allocatedShare)}</span> / AI 总仓位 {pct(props.targetPortfolioShare)}
        <span className="mx-1.5">·</span>{budget.overBudget ? `超出 ${pct(budget.excessShare)}，请调低标的上限或提高 AI 总仓位` : `待分配 ${pct(budget.remainingShare)}`}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => props.onOpenSettings()} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Settings2 className="h-3.5 w-3.5" />仓位设置</button>
      <div role="group" aria-label="AI 仓位展示方式" className="inline-flex rounded-lg bg-muted/50 p-1">
        {(['chart', 'table'] as const).map(mode => {
          const Icon = mode === 'chart' ? ChartNoAxesCombined : List;
          return <button key={mode} type="button" aria-pressed={view === mode} onClick={() => {
            if (view === mode) return;
            if (mode === 'chart') setActivationKey(key => key + 1);
            setView(mode);
          }} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', view === mode ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}><Icon className="h-3.5 w-3.5" />{mode === 'chart' ? '图表' : '明细'}</button>;
        })}
      </div>
      </div>
    </div>
    <Activity mode={view === 'chart' ? 'visible' : 'hidden'}><TargetStackedRungsChart derived={props.derived} totalPortfolioUsd={props.totalPortfolioUsd} activeSector={props.activeSector} activationKey={activationKey} /></Activity>
    <Activity mode={view === 'table' ? 'visible' : 'hidden'}><TargetTable {...props} /></Activity>
  </section>;
}
