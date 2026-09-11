'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { SectorAllocation } from '@/types/accumulation';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const clampPct = (value: number) => Math.min(100, Math.max(0, value));

function normalize(allocations: SectorAllocation[]): SectorAllocation[] {
  const total = allocations.reduce((sum, item) => sum + item.ratio, 0);
  if (allocations.length === 0) return [];
  if (total <= 0) {
    return allocations.map((item) => ({
      ...item,
      ratio: 1 / allocations.length,
    }));
  }
  return allocations.map((item) => ({ ...item, ratio: item.ratio / total }));
}

function rebalance(
  allocations: SectorAllocation[],
  index: number,
  nextPct: number
): SectorAllocation[] {
  if (allocations.length === 1) {
    return [{ ...allocations[0], ratio: 1 }];
  }
  const nextRatio = clampPct(nextPct) / 100;
  const otherTotal = allocations.reduce(
    (sum, item, itemIndex) => sum + (itemIndex === index ? 0 : item.ratio),
    0
  );
  const remaining = 1 - nextRatio;
  return allocations.map((item, itemIndex) => {
    if (itemIndex === index) return { ...item, ratio: nextRatio };
    return {
      ...item,
      ratio:
        otherTotal > 0
          ? (item.ratio / otherTotal) * remaining
          : remaining / (allocations.length - 1),
    };
  });
}

export function SectorAllocationDialog({
  allocations,
  targetCounts,
  targetTotalUsd,
  sectorColors,
  onClose,
  onApply,
}: {
  allocations: SectorAllocation[];
  targetCounts: ReadonlyMap<string, number>;
  targetTotalUsd: number;
  sectorColors: ReadonlyMap<string, string>;
  onClose: () => void;
  onApply: (allocations: SectorAllocation[], removedSectors: string[]) => void;
}) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const [draft, setDraft] = useState(() => normalize(allocations));
  const [newSector, setNewSector] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removedSectors, setRemovedSectors] = useState<Set<string>>(
    () => new Set()
  );

  const totalPct = useMemo(
    () => draft.reduce((sum, item) => sum + item.ratio, 0) * 100,
    [draft]
  );

  const changePct = (index: number, value: number) => {
    if (!Number.isFinite(value)) return;
    setDraft((current) => rebalance(current, index, value));
  };

  const addSector = () => {
    const sector = newSector.trim();
    if (!sector) {
      setError('请输入板块名称');
      return;
    }
    if (draft.some((item) => item.sector === sector)) {
      setError('这个板块已经存在');
      return;
    }
    const initialRatio = draft.length === 0 ? 1 : 0.05;
    const scaled = draft.map((item) => ({
      ...item,
      ratio: item.ratio * (1 - initialRatio),
    }));
    setDraft([...scaled, { sector, ratio: initialRatio }]);
    setRemovedSectors((current) => {
      const next = new Set(current);
      next.delete(sector);
      return next;
    });
    setNewSector('');
    setError(null);
  };

  const removeSector = (index: number) => {
    const item = draft[index];
    const targetCount = targetCounts.get(item.sector) ?? 0;
    if (item.sector === '未分类' && targetCount > 0) return;
    if (draft.length === 1 && targetCount === 0) {
      setError('至少保留一个板块');
      return;
    }
    if (
      targetCount > 0 &&
      !window.confirm(
        `删除「${item.sector}」后，其中 ${targetCount} 个标的会移入「未分类」。继续吗？`
      )
    ) {
      return;
    }

    let next = draft.filter((_, itemIndex) => itemIndex !== index);
    if (targetCount > 0) {
      const uncategorizedIndex = next.findIndex(
        (allocation) => allocation.sector === '未分类'
      );
      if (uncategorizedIndex >= 0) {
        next = next.map((allocation, itemIndex) =>
          itemIndex === uncategorizedIndex
            ? { ...allocation, ratio: allocation.ratio + item.ratio }
            : allocation
        );
      } else {
        next.push({ sector: '未分类', ratio: item.ratio });
      }
    } else {
      next = normalize(next);
    }
    setDraft(normalize(next));
    setRemovedSectors((current) => new Set(current).add(item.sector));
    setError(null);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>板块加仓占比</DialogTitle>
          <DialogDescription>
            调整一个板块时，其余板块会按比例联动，总占比始终保持 100%。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {draft.map((allocation, index) => {
            const pct = allocation.ratio * 100;
            const targetCount = targetCounts.get(allocation.sector) ?? 0;
            const cannotDelete =
              allocation.sector === '未分类' && targetCount > 0;
            const color = sectorColors.get(allocation.sector) ?? '#64748b';
            return (
              <div
                key={allocation.sector}
                className="rounded-lg border px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {allocation.sector}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {targetCount > 0 ? `${targetCount} 个标的` : '暂无标的'} · 目标{' '}
                      {hidden ? '****' : fmtUsd(targetTotalUsd * allocation.ratio)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => changePct(index, pct - 1)}
                    aria-label={`${allocation.sector}占比减少 1%`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <label className="flex h-7 items-center overflow-hidden rounded-md border bg-background focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/25">
                    <span className="sr-only">{allocation.sector}占比</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={Number(pct.toFixed(1))}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        changePct(index, Number(event.target.value))
                      }
                      className="w-14 bg-transparent px-1.5 text-right text-xs tabular-nums outline-none"
                    />
                    <span className="pr-1.5 text-xs text-muted-foreground">%</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => changePct(index, pct + 1)}
                    aria-label={`${allocation.sector}占比增加 1%`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={cannotDelete}
                    onClick={() => removeSector(index)}
                    aria-label={`删除板块 ${allocation.sector}`}
                    title={
                      cannotDelete
                        ? '未分类中还有标的，无法删除'
                        : '删除板块'
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/35 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 rounded-lg border border-dashed p-2">
          <input
            value={newSector}
            onChange={(event) => {
              setNewSector(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addSector();
            }}
            placeholder="新板块名称"
            className="h-8 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="button" variant="secondary" onClick={addSector}>
            <Plus />
            新增板块
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{error ?? '新增板块默认分配 5%，其余板块自动缩减'}</span>
          <span className="font-medium text-foreground tabular-nums">
            合计 {totalPct.toFixed(1)}%
          </span>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => onApply(normalize(draft), [...removedSectors])}
          >
            应用配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
