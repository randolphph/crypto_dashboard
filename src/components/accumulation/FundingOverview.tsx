'use client';

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

export function FundingOverview({ funding }: { funding: FundingData }) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const sharePct = (funding.aiShareOfPortfolio * 100).toFixed(1);

  return (
    <div className="flex flex-col gap-3">
      <Stat
        label="AI 占总资产比"
        value={hidden ? '****' : `${sharePct}%`}
        sub={`现值 ${hidden ? '****' : fmtUsd(funding.aiCurrentTotal)} / 目标 ${hidden ? '****' : fmtUsd(funding.aiTargetTotal)}`}
      />
      <Stat
        label="待加额度"
        value={hidden ? '****' : fmtUsd(funding.pendingBudget)}
      />
    </div>
  );
}
