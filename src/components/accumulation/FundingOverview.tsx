'use client';

import { useEffect, useMemo, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Slider } from '@base-ui/react/slider';
import { Pencil, X } from 'lucide-react';
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
  onTargetPortfolioShareChange,
  getFundingPreview,
}: {
  funding: FundingData;
  targetPortfolioShare: number;
  onTargetPortfolioShareChange: (share: number) => void;
  getFundingPreview: (share: number) => {
    aiTargetTotal: number;
    pendingBudget: number;
  };
}) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const sharePct = (funding.aiShareOfPortfolio * 100).toFixed(1);
  const targetSharePct = targetPortfolioShare * 100;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(Number(targetSharePct.toFixed(1))));

  useEffect(() => {
    if (!open) setDraft(String(Number(targetSharePct.toFixed(1))));
  }, [targetSharePct, open]);

  const parsedDraft = Number.parseFloat(draft);
  const draftIsValid = Number.isFinite(parsedDraft);
  const draftPct = draftIsValid
    ? Math.min(100, Math.max(0, parsedDraft))
    : 0;
  const preview = useMemo(
    () => getFundingPreview(draftPct / 100),
    [draftPct, getFundingPreview]
  );

  const changeDraft = (value: number) => {
    setDraft(String(Math.min(100, Math.max(0, value))));
  };

  const applyTargetShare = () => {
    if (!draftIsValid) return;
    onTargetPortfolioShareChange(draftPct / 100);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <Popover.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) {
            setDraft(String(Number(targetSharePct.toFixed(1))));
          }
        }}
      >
        <Popover.Trigger
          className="group w-full rounded-lg border px-3 py-2 text-left transition-colors hover:border-blue-500/40 hover:bg-blue-500/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">AI 仓位目标</span>
            <Pencil className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-blue-500" />
          </span>
          <span className="mt-0.5 block text-lg font-semibold tabular-nums">
            {Number(targetSharePct.toFixed(1))}%
          </span>
          <span className="block text-[11px] text-muted-foreground">
            当前 {hidden ? '****' : `${sharePct}%`} · 目标{' '}
            {hidden ? '****' : fmtUsd(funding.aiTargetTotal)}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="right"
            align="start"
            sideOffset={12}
            className="z-50"
          >
            <Popover.Popup className="w-[min(22rem,calc(100vw-2rem))] origin-[var(--transform-origin)] rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <div className="flex items-center justify-between gap-3">
                <Popover.Title className="text-sm font-medium">
                  设置 AI 仓位目标
                </Popover.Title>
                <Popover.Close
                  aria-label="关闭仓位设置"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </Popover.Close>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {[25, 30, 35, 40].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => changeDraft(preset)}
                    className={`rounded-full px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 ${
                      draftPct === preset
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <Slider.Root
                  value={draftPct}
                  onValueChange={changeDraft}
                  min={0}
                  max={100}
                  step={1}
                  className="flex min-w-0 flex-1 items-center"
                >
                  <Slider.Control className="flex h-5 w-full touch-none items-center select-none">
                    <Slider.Track className="relative h-1 w-full rounded-full bg-secondary">
                      <Slider.Indicator className="rounded-full bg-blue-500" />
                      <Slider.Thumb
                        aria-label="AI 仓位目标百分比"
                        className="h-4 w-4 rounded-full border-2 border-blue-500 bg-background shadow-sm outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500/35"
                      />
                    </Slider.Track>
                  </Slider.Control>
                </Slider.Root>
                <label className="flex h-8 items-center overflow-hidden rounded-md border bg-background focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/25">
                  <span className="sr-only">自定义仓位百分比</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    inputMode="decimal"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyTargetShare();
                    }}
                    className="w-12 bg-transparent px-2 text-right text-sm tabular-nums outline-none"
                  />
                  <span className="border-l px-2 text-xs text-muted-foreground">%</span>
                </label>
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>0%</span>
                <span>100%</span>
              </div>

              <div className="mt-4 rounded-md bg-secondary/70 px-3 py-2 text-xs text-muted-foreground">
                <span>目标金额 </span>
                <span className="font-medium text-foreground tabular-nums">
                  {hidden ? '****' : fmtUsd(preview.aiTargetTotal)}
                </span>
                <span className="mx-1.5">·</span>
                <span>待加 </span>
                <span className="font-medium text-foreground tabular-nums">
                  {hidden ? '****' : fmtUsd(preview.pendingBudget)}
                </span>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={!draftIsValid}
                  onClick={applyTargetShare}
                  className="rounded-md bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  应用
                </button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Stat
        label="待加额度"
        value={hidden ? '****' : fmtUsd(funding.pendingBudget)}
        sub="按各标的目标权重分配"
      />
    </div>
  );
}
