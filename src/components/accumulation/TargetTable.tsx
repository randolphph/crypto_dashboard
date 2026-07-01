'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, Pencil } from 'lucide-react';
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
import { MARKET_LABEL } from '@/types/stocks';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { cn } from '@/lib/utils';
import { StockLogo } from './StockLogo';
import { PriceAge } from '@/components/common/PriceAge';

type SortKey =
  | 'symbol'
  | 'sector'
  | 'currentValue'
  | 'targetValue'
  | 'remaining'
  | 'tier';

const NUM = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

const ROW_PROGRESS_MARKERS = [
  'repeating-linear-gradient(to bottom, var(--accumulation-row-progress-marker-20) 0 2px, transparent 2px 5px)',
  'repeating-linear-gradient(to bottom, var(--accumulation-row-progress-marker-50) 0 2px, transparent 2px 5px)',
].join(', ');

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
    case 'tier':
      return d.nearestTierLevel ?? 4;
  }
}

function tierProximity(tier: DerivedTier): number {
  if (tier.triggered) return 1;
  if (tier.gapPct === null || tier.gapPct <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - tier.gapPct / TRIGGER_THRESHOLD));
}

const PCT = (v: number) => (v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1);

// 三档锚价: 档1 hangs off ma20 (read-only); 档2/档3 show their drop relative
// to 档1's anchor and let you edit that ratio inline. Committing rebuilds the
// target's relRatios pair from the two current ratios so editing one keeps the
// other.
function TierCell({
  d,
  onUpdate,
}: {
  d: DerivedTarget;
  onUpdate?: (id: string, updates: { relRatios: [number, number] }) => void;
}) {
  // Which tier level (2 or 3) is being edited, plus the draft percent text.
  const [editing, setEditing] = useState<2 | 3 | null>(null);
  const [draft, setDraft] = useState('');

  const currentRel = (level: 2 | 3): number =>
    d.tiers.find((t) => t.level === level)?.relToTier1 ?? 0;

  const startEdit = (level: 2 | 3) => {
    setEditing(level);
    setDraft(PCT(currentRel(level)));
  };

  const commit = () => {
    if (editing === null) return;
    const pct = parseFloat(draft);
    if (Number.isFinite(pct)) {
      // Clamp to a sane 0–50% drop; ratios are fractions of 档1's price.
      const r = Math.min(0.5, Math.max(0, pct / 100));
      const pair: [number, number] = [currentRel(2), currentRel(3)];
      pair[editing - 2] = r;
      onUpdate?.(d.target.id, { relRatios: pair });
    }
    setEditing(null);
  };

  return (
    <div className="flex items-center gap-1">
      {d.tiers.map((tier) => {
        const isEditing = editing === tier.level;
        const proximity = tierProximity(tier);
        const color = `var(--accumulation-tier-${tier.level})`;
        return (
          <span
            key={tier.level}
            title={`档${tier.level} · 锚价 ${NUM(tier.price)} · 接近 ${(proximity * 100).toFixed(0)}% · 预算 $${NUM(tier.amount)}${tier.relToTier1 !== null ? ` · 较档1 ↓${PCT(tier.relToTier1)}%` : ''}${tier.gapPct !== null ? ` · 距 ${(tier.gapPct * 100).toFixed(1)}%` : ''}`}
            className="relative isolate inline-flex items-center gap-1 overflow-hidden rounded border bg-background px-1.5 py-0.5 text-[11px] text-foreground tabular-nums"
            style={{
              borderColor: `color-mix(in srgb, ${color} var(--accumulation-tier-border-opacity), transparent)`,
            }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 z-0 transition-[width] duration-500"
              style={{
                width: `${proximity * 100}%`,
                backgroundColor: `color-mix(in srgb, ${color} var(--accumulation-tier-fill-opacity), transparent)`,
              }}
            />
            <span className="relative z-10 font-medium" style={{ color }}>
              {NUM(tier.price)}
            </span>
            {tier.level !== 1 &&
              (isEditing ? (
                <input
                  autoFocus
                  type="number"
                  step="0.5"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="relative z-10 w-10 rounded border bg-background px-1 text-[11px] tabular-nums outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <button
                  onClick={() => startEdit(tier.level as 2 | 3)}
                  title="点击编辑：相对档1锚价的下跌比例"
                  className="relative z-10 inline-flex items-center gap-0.5 text-[10px] opacity-70 hover:opacity-100"
                >
                  ↓{PCT(tier.relToTier1 ?? 0)}%
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              ))}
          </span>
        );
      })}
    </div>
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
  sectorColors,
  activeSector,
  onUpdate,
}: {
  derived: DerivedTarget[];
  sectorColors: ReadonlyMap<string, string>;
  activeSector?: string | null;
  onUpdate?: (id: string, updates: { relRatios: [number, number] }) => void;
}) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  const [sortKey, setSortKey] = useState<SortKey>('tier');
  const [asc, setAsc] = useState(false);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      // Text columns read naturally in ascending order; tiers and numeric
      // amounts default to descending.
      setAsc(k === 'symbol' || k === 'sector');
    }
  };

  const rows = useMemo(() => {
    const sorted = [...derived].sort((a, b) => {
      // A selected/hovered sector forms the first group. The active sort still
      // applies inside that group and to all remaining rows.
      if (activeSector) {
        const am = (a.target.sector || '未分类') === activeSector ? 0 : 1;
        const bm = (b.target.sector || '未分类') === activeSector ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      if (sortKey === 'tier') {
        const at = a.nearestTierLevel;
        const bt = b.nearestTierLevel;
        // Rows without a current tier always stay at the end.
        if (at === null && bt !== null) return 1;
        if (at !== null && bt === null) return -1;
        if (at !== null && bt !== null && at !== bt) {
          return asc ? at - bt : bt - at;
        }
        // Within a tier, the closest target appears first.
        const byProximity = b.proximity - a.proximity;
        if (byProximity !== 0) return byProximity;
        return a.target.symbol.localeCompare(b.target.symbol);
      }
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
  }, [derived, sortKey, asc, activeSector]);

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
            <TableHead className="text-right">盈亏</TableHead>
            <TableHead className="text-right">今日%</TableHead>
            <SortHeader label="目标" k="targetValue" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <SortHeader label="现值" k="currentValue" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <SortHeader label="待加" k="remaining" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <TableHead className="text-right">现价</TableHead>
            <SortHeader label="三档锚价" k="tier" sortKey={sortKey} asc={asc} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => {
            const sectorColor =
              sectorColors.get(d.target.sector || '未分类') ?? '#64748b';
            const progress = (d.progressPct * 100).toFixed(1);
            const progressColor = `color-mix(in srgb, ${sectorColor} var(--accumulation-row-progress-opacity), transparent)`;
            const sectorActive =
              !!activeSector && d.target.sector === activeSector;
            const sectorDimmed =
              !!activeSector && d.target.sector !== activeSector;
            return (
            <TableRow
              key={d.target.id}
              title={`加仓进度 ${progress}% · 刻度线 20% / 50%`}
              className={cn(
                'transition-opacity',
                sectorDimmed && 'opacity-40'
              )}
              style={{
                backgroundImage: `${ROW_PROGRESS_MARKERS}, linear-gradient(to right, ${progressColor} 0%, ${progressColor} ${progress}%, transparent ${progress}%, transparent 100%)`,
                backgroundPosition: '20% 0, 50% 0, 0 0',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '1px 100%, 1px 100%, 100% 100%',
                boxShadow: sectorActive
                  ? `inset 3px 0 0 ${sectorColor}`
                  : undefined,
              }}
            >
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <StockLogo
                    key={`${d.target.market}:${d.target.symbol}`}
                    market={d.target.market}
                    symbol={d.target.symbol}
                  />
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
                {d.isHeld ? hidden ? '****' : fmtUsd(d.currentValue) : '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {hidden ? '****' : fmtUsd(d.remaining)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.livePrice !== null ? (
                  <span className="inline-flex flex-col items-end">
                    <span>{NUM(d.livePrice)}</span>
                    <PriceAge updatedAt={d.priceUpdatedAt} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">无报价</span>
                )}
              </TableCell>
              <TableCell>
                <TierCell d={d} onUpdate={onUpdate} />
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
