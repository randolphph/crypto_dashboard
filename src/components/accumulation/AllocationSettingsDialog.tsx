'use client';

import { useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { assertPositionBudget, getPositionBudget, parsePositionLimitPercent } from '@/lib/accumulation/positionLimit';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import type { AccumulationTarget } from '@/types/accumulation';
import { StockLogo } from './StockLogo';
import { cn } from '@/lib/utils';

const percentDraft = (share: number) => new Decimal(share).times(100).toString();
const percent = (share: number) => share.toLocaleString('zh-CN', { style: 'percent', maximumSignificantDigits: 6 });
const inputClass = 'w-20 rounded-md border bg-background px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 aria-invalid:border-negative';

export function AllocationSettingsDialog({ targets, targetPortfolioShare, totalPortfolioUsd, aiCurrentTotal, initialTargetId, onClose, onApply }: {
  targets: AccumulationTarget[];
  targetPortfolioShare: number;
  totalPortfolioUsd: number;
  aiCurrentTotal: number;
  initialTargetId?: string;
  onClose: () => void;
  onApply: (share: number, limits: Record<string, number | undefined>) => void;
}) {
  // Capture the editable plan when opened; background quote updates never reset drafts.
  const [rows] = useState(targets);
  const [draftShare, setDraftShare] = useState(() => percentDraft(targetPortfolioShare));
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(targets.map(target => [target.id, target.positionLimitShare === undefined ? '' : percentDraft(target.positionLimitShare)])));
  const [saveError, setSaveError] = useState('');
  const globalInput = useRef<HTMLInputElement>(null);
  const targetInputs = useRef(new Map<string, HTMLInputElement>());
  const { fmtUsd } = usePrivacyFormat();
  const limits: Record<string, number | undefined> = {};
  const fieldErrors: Record<string, string> = {};
  let share = 0, validationError = '';
  try {
    if (!draftShare.trim()) throw new Error('请输入 AI 仓位目标');
    share = new Decimal(Number(draftShare)).div(100).toNumber();
    assertPositionBudget([], share);
  } catch (cause) { validationError = cause instanceof Error ? cause.message : 'AI 仓位目标无效'; }
  for (const target of rows) {
    try { limits[target.id] = parsePositionLimitPercent(drafts[target.id]); }
    catch { fieldErrors[target.id] = '请输入大于 0 且不超过 100 的百分比，或留空清除'; }
  }
  const fieldsValid = Object.keys(fieldErrors).length === 0;
  const budget = fieldsValid ? getPositionBudget(rows.map(target => ({ positionLimitShare: limits[target.id] })), share) : null;
  const valid = !validationError && fieldsValid && budget !== null && !budget.overBudget;
  const apply = () => {
    if (!valid) return;
    try { onApply(share, limits); onClose(); }
    catch (cause) { setSaveError(cause instanceof Error ? cause.message : '仓位设置保存失败'); }
  };

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg" initialFocus={() => targetInputs.current.get(initialTargetId ?? '') ?? globalInput.current}>
      <div className="shrink-0 px-5 pt-5 pb-4">
        <DialogTitle className="pr-8">仓位设置</DialogTitle>
        <DialogDescription className="mt-2 text-xs">AI 目标与标的上限均为占总资产的比例，修改后统一应用。</DialogDescription>
      </div>
      <form noValidate onSubmit={event => { event.preventDefault(); apply(); }} className="flex min-h-0 flex-col">
        <div className="shrink-0 space-y-3 border-y bg-muted/25 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="ai-allocation-target" className="text-sm font-medium">AI 仓位目标</label>
            <div className="flex items-center gap-1.5"><input ref={globalInput} id="ai-allocation-target" aria-label="AI 仓位目标百分比" aria-invalid={!!validationError} type="number" min="0" max="100" step="any" inputMode="decimal" value={draftShare} onChange={event => { setDraftShare(event.target.value); setSaveError(''); }} className={inputClass} /><span className="text-xs text-muted-foreground">%</span></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[25, 30, 35, 40].map(value => <button key={value} type="button" aria-pressed={Number(draftShare) === value} onClick={() => { setDraftShare(String(value)); setSaveError(''); }} className={cn('rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', draftShare.trim() && Number(draftShare) === value ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground hover:text-foreground')}>{value}%</button>)}
          </div>
          {!validationError && <p className="text-xs text-muted-foreground">目标金额 <span className="tabular-nums text-foreground">{fmtUsd(totalPortfolioUsd * share)}</span><span className="mx-2">·</span>待加 <span className="tabular-nums text-foreground">{fmtUsd(totalPortfolioUsd * share - aiCurrentTotal)}</span></p>}
          <p data-allocation-draft-budget role={budget?.overBudget || validationError ? 'alert' : 'status'} className={cn('text-xs tabular-nums', budget?.overBudget || validationError ? 'text-negative' : 'text-muted-foreground')}>
            {validationError || (budget ? `已分配 ${percent(budget.allocatedShare)} · ${budget.overBudget ? `超出 ${percent(budget.excessShare)}，请调整分配` : `待分配 ${percent(budget.remainingShare)}`}` : '请检查标的上限')}
          </p>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-2">
          <div className="flex justify-between py-2 text-[11px] text-muted-foreground"><span>标的</span><span>仓位上限 · 占总资产</span></div>
          {rows.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">暂无标的，可先通过计划 JSON 添加。</p>}
          {rows.map(target => <div key={target.id} className="border-t py-2.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`allocation-${target.id}`} className="flex min-w-0 items-center gap-2"><StockLogo market={target.market} symbol={target.symbol} /><span className="truncate text-sm font-medium">{target.symbol}</span></label>
              <div className="flex shrink-0 items-center gap-1.5"><input ref={element => { if (element) targetInputs.current.set(target.id, element); else targetInputs.current.delete(target.id); }} id={`allocation-${target.id}`} aria-label={`${target.symbol} 仓位上限百分比`} aria-invalid={!!fieldErrors[target.id]} aria-describedby={fieldErrors[target.id] ? `allocation-error-${target.id}` : undefined} type="number" min="0" max="100" step="any" inputMode="decimal" placeholder="未设置" value={drafts[target.id]} onChange={event => { setDrafts(previous => ({ ...previous, [target.id]: event.target.value })); setSaveError(''); }} className={inputClass} /><span className="text-xs text-muted-foreground">%</span></div>
            </div>
            {fieldErrors[target.id] && <p id={`allocation-error-${target.id}`} role="alert" className="mt-1 text-xs text-negative">{fieldErrors[target.id]}</p>}
          </div>)}
        </div>
        <div className="shrink-0 border-t px-5 py-4">
          <p className="mb-3 text-[11px] text-muted-foreground">标的上限合计不能超过 AI 仓位目标，留空表示未设置。</p>
          {saveError && <p role="alert" className="mb-3 text-xs text-negative">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">取消</button>
            <button type="submit" disabled={!valid} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">应用</button>
          </div>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
