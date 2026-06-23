'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, Flame } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TRIGGER_THRESHOLD,
  displayName,
  type DerivedTarget,
  type DerivedTier,
} from '@/lib/accumulation/derive';
import { TARGET_STATUS_LABEL } from '@/types/accumulation';
import { MARKET_LABEL } from '@/types/stocks';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { cn } from '@/lib/utils';

type SortKey =
  | 'symbol'
  | 'sector'
  | 'currentValue'
  | 'targetValue'
  | 'remaining'
  | 'proximity';

const NUM = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

function sortValue(d: DerivedTarget, key: SortKey): number | string {
  switch (key) {
    case 'symbol':
      return d.target.symbol;
    case 'sector':
      return d.target.sector;
    case 'currentValue':
      return d.currentValue;
    case 'targetValue':
      return d.target.targetValue;
    case 'remaining':
      return d.remaining;
    case 'proximity':
      return d.proximity;
  }
}

function TierChip({ tier }: { tier: DerivedTier }) {
  const near =
    tier.gapPct !== null && tier.gapPct > 0 && tier.gapPct <= TRIGGER_THRESHOLD;
  return (
    <span
      title={`档${tier.level} · 锚价 ${NUM(tier.price)} · 预算 $${NUM(tier.amount)}${tier.gapPct !== null ? ` · 距 ${(tier.gapPct * 100).toFixed(1)}%` : ''}`}
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] tabular-nums',
        tier.triggered
          ? 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40'
          : near
            ? 'bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/40'
            : 'bg-muted text-muted-foreground'
      )}
    >
      {NUM(tier.price)}
    </span>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  asc,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === k;
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {label}
        <ArrowUpDown className={cn('h-3 w-3', active && (asc ? 'rotate-180' : ''))} />
      </button>
    </TableHead>
  );
}

export function TargetTable({
  derived,
  activeSector,
}: {
  derived: DerivedTarget[];
  activeSector?: string | null;
}) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const [sortKey, setSortKey] = useState<SortKey>('proximity');
  const [asc, setAsc] = useState(false);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      // Numeric columns default to descending (biggest/closest first), text asc.
      setAsc(k === 'symbol' || k === 'sector');
    }
  };

  const rows = useMemo(() => {
    const sorted = [...derived].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === 'string' && typeof vb === 'string') {
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return asc
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
    });
    return sorted;
  }, [derived, sortKey, asc]);

  if (derived.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        暂无加仓标的
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortHeader label="标的" k="symbol" sortKey={sortKey} asc={asc} onSort={onSort} />
            <SortHeader label="板块" k="sector" sortKey={sortKey} asc={asc} onSort={onSort} />
            <TableHead className="text-right">现价 / MA20</TableHead>
            <SortHeader label="现值" k="currentValue" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <TableHead className="text-right">盈亏</TableHead>
            <TableHead className="text-right">今日%</TableHead>
            <SortHeader label="目标" k="targetValue" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <SortHeader label="待加" k="remaining" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <TableHead>进度</TableHead>
            <TableHead>三档锚价</TableHead>
            <SortHeader label="接近度" k="proximity" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => {
            const sectorActive =
              !!activeSector && d.target.sector === activeSector;
            const sectorDimmed =
              !!activeSector && d.target.sector !== activeSector;
            return (
            <TableRow
              key={d.target.id}
              className={cn(
                'transition-opacity',
                d.flagged && 'bg-amber-500/10 hover:bg-amber-500/15',
                sectorActive && 'bg-blue-500/10 hover:bg-blue-500/15',
                sectorDimmed && 'opacity-40'
              )}
            >
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {d.flagged && <Flame className="h-3.5 w-3.5 text-amber-500" />}
                  {(() => {
                    const label = displayName(
                      d.target.market,
                      d.target.symbol,
                      d.name
                    );
                    return (
                      <>
                        <span className="font-medium">{label}</span>
                        {label !== d.target.symbol && (
                          <span className="text-[10px] text-muted-foreground">
                            {d.target.symbol}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {MARKET_LABEL[d.target.market]}
                  </span>
                  {!d.isHeld && (
                    <span
                      title="计划内但当前未持仓"
                      className="rounded bg-violet-500/15 px-1 py-0.5 text-[10px] text-violet-600"
                    >
                      未持仓
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {d.target.sector || '—'}
              </TableCell>
              <TableCell
                className="text-right tabular-nums"
                title={
                  d.costBasisLocal !== null
                    ? `成本价 ${NUM(d.costBasisLocal)}`
                    : undefined
                }
              >
                {d.livePrice !== null ? (
                  <span>
                    {NUM(d.livePrice)}
                    <span className="text-muted-foreground"> / {NUM(d.target.ma20)}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">无报价 / {NUM(d.target.ma20)}</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.isHeld ? hidden ? '****' : fmtUsd(d.currentValue) : '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.pnlUsd !== null ? (
                  <span className={d.pnlUsd >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {hidden ? '****' : `${d.pnlUsd >= 0 ? '+' : ''}${fmtUsd(d.pnlUsd)}`}
                    {d.pnlPct !== null && (
                      <span className="text-muted-foreground text-xs">
                        {' '}
                        ({d.pnlPct >= 0 ? '+' : ''}
                        {d.pnlPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.changePct !== null ? (
                  <span className={d.changePct >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {d.changePct >= 0 ? '+' : ''}
                    {d.changePct.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {hidden ? '****' : fmtUsd(d.target.targetValue)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {hidden ? '****' : fmtUsd(d.remaining)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${(d.progressPct * 100).toFixed(0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {(d.progressPct * 100).toFixed(0)}%
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {d.tiers.map((t) => (
                    <TierChip key={t.level} tier={t} />
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span
                  className={cn(
                    d.proximity >= 0.99
                      ? 'text-emerald-600 font-medium'
                      : d.proximity > 0
                        ? 'text-amber-600'
                        : 'text-muted-foreground'
                  )}
                >
                  {(d.proximity * 100).toFixed(0)}%
                </span>
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px]',
                    d.target.status === 'active'
                      ? 'bg-blue-500/15 text-blue-600'
                      : d.target.status === 'paused'
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-emerald-500/15 text-emerald-600'
                  )}
                >
                  {TARGET_STATUS_LABEL[d.target.status]}
                </span>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
