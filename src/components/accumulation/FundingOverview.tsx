'use client';

import { Pencil } from 'lucide-react';
import type { FundingOverview as FundingData } from '@/lib/accumulation/derive';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function FundingOverview({
  funding,
  targetPortfolioShare,
  onOpenSettings,
}: {
  funding: FundingData;
  targetPortfolioShare: number;
  onOpenSettings: () => void;
}) {
  const { fmtUsd: formatUsd, hidden, percentHidden } = usePrivacyFormat();
  const fmtUsd = (value: number) => Number.isFinite(value) ? formatUsd(value) : '—';
  const sharePct = Number.isFinite(funding.aiShareOfPortfolio) ? (funding.aiShareOfPortfolio * 100).toFixed(1) : '—';
  return (
    <div className="flex flex-col gap-3">
        <button type="button" onClick={onOpenSettings}
          className="group w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">AI 仓位目标</span>
            <Pencil className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-primary" />
          </span>
          <span className="mt-0.5 block text-lg font-semibold tabular-nums">
            {percentHidden ? '**%' : targetPortfolioShare.toLocaleString('zh-CN', { style: 'percent', maximumSignificantDigits: 6 })}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            当前 {percentHidden ? '**%' : `${sharePct}%`} · 目标{' '}
            {hidden ? '****' : fmtUsd(funding.aiTargetTotal)}
          </span>
        </button>
      <Stat
        label="已有 AI 仓位"
        value={hidden ? '****' : fmtUsd(funding.aiCurrentTotal)}
        sub={`占总资产 ${percentHidden ? '**%' : `${sharePct}%`}`}
      />
    </div>
  );
}
