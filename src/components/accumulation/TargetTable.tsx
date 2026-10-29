'use client';

import { useState, useMemo, useRef } from 'react';
import { ArrowUpDown, Pencil, RotateCcw, Trash2 } from 'lucide-react';
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
import { MARKET_CURRENCY, MARKET_LABEL } from '@/types/stocks';
import type { AccumulationTarget, TierPrices } from '@/types/accumulation';
import { formatCurrency } from '@/lib/format';
import { sortTargets, type TargetSortKey as SortKey } from '@/lib/accumulation/sort';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { cn } from '@/lib/utils';
import { StockLogo } from './StockLogo';
import { PriceAge } from '@/components/common/PriceAge';

const NUM = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const QUANTITY = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 8 });

function tierProximity(tier: DerivedTier): number {
  if (tier.triggered) return 1;
  if (tier.gapPct === null || tier.gapPct <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - tier.gapPct / TRIGGER_THRESHOLD));
}

const PCT = (v: number) => (v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1);

type AnchorUpdates = Partial<Pick<AccumulationTarget, 'tierPrices' | 'relRatios'>>;
type TierLevel = 1 | 2 | 3;

function TierCell({ d, onUpdate }: {
  d: DerivedTarget;
  onUpdate?: (id: string, updates: AnchorUpdates) => void;
}) {
  const [editing, setEditing] = useState<{ level: TierLevel; kind: 'price' | 'ratio' } | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const finished = useRef(false);
  const currentRel = (level: 2 | 3) => d.tiers[level - 1].relToTier1 ?? 0;
  const prices = (): TierPrices => [...(d.target.tierPrices ?? [null, null, null])];

  const startEdit = (tier: DerivedTier, kind: 'price' | 'ratio') => {
    finished.current = false;
    setError('');
    setDraft(kind === 'price' ? String(tier.price) : PCT(tier.relToTier1 ?? 0));
    setEditing({ level: tier.level, kind });
  };
  const commit = () => {
    if (!editing || finished.current) return;
    const value = draft.trim() === '' ? NaN : Number(draft);
    if (!Number.isFinite(value) || (editing.kind === 'price' && value <= 0)) {
      setError(editing.kind === 'price' ? '请输入大于0的有效价格' : '请输入有效比例');
      return;
    }
    finished.current = true;
    const next = prices();
    if (editing.kind === 'price') {
      next[editing.level - 1] = value;
      onUpdate?.(d.target.id, { tierPrices: next });
    } else {
      const pair: [number, number] = [currentRel(2), currentRel(3)];
      pair[editing.level - 2] = Math.min(0.5, Math.max(0, value / 100));
      next[editing.level - 1] = null;
      onUpdate?.(d.target.id, { relRatios: pair, tierPrices: next });
    }
    setEditing(null);
    setError('');
  };
  const editor = (tier: DerivedTier, kind: 'price' | 'ratio') => (
    <input
      autoFocus
      aria-label={`${d.target.symbol} 档${tier.level}${kind === 'price' ? '锚价' : '下跌比例'}`}
      aria-invalid={!!error}
      type="number"
      step={kind === 'price' ? 'any' : '0.5'}
      min={kind === 'price' ? '0' : undefined}
      value={draft}
      onChange={(e) => { setDraft(e.target.value); setError(''); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') {
          e.preventDefault();
          finished.current = true;
          setEditing(null);
          setError('');
        }
      }}
      className={cn('relative z-10 rounded border bg-background px-1 text-[11px] tabular-nums outline-none focus:ring-1 focus:ring-primary', kind === 'price' ? 'w-24' : 'w-12')}
    />
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        {d.tiers.map((tier) => {
          const proximity = tierProximity(tier);
          const color = `var(--accumulation-tier-${tier.level})`;
          const raw = d.target.tierPrices?.[tier.level - 1];
          const manual = typeof raw === 'number' && Number.isFinite(raw) && raw > 0;
          const relative = tier.relToTier1 ?? 0;
          const relativeLabel = `${relative < 0 ? '↑' : '↓'}${PCT(Math.abs(relative))}%`;
          return (
            <span
              key={tier.level}
              title={`档${tier.level} · ${manual ? '手动' : '自动'}锚价 ${NUM(tier.price)} · 接近 ${(proximity * 100).toFixed(0)}%${tier.relToTier1 !== null ? ` · 较档1 ${relativeLabel}` : ''}${tier.gapPct !== null ? ` · 距 ${(tier.gapPct * 100).toFixed(1)}%` : ''}`}
              className="relative isolate inline-flex items-center gap-1 overflow-hidden rounded border bg-background px-1.5 py-0.5 text-[11px] text-foreground tabular-nums"
              style={{ borderColor: `color-mix(in srgb, ${color} var(--accumulation-tier-border-opacity), transparent)` }}
            >
              <span aria-hidden className="absolute inset-y-0 left-0 z-0 transition-[width] duration-500" style={{ width: `${proximity * 100}%`, backgroundColor: `color-mix(in srgb, ${color} var(--accumulation-tier-fill-opacity), transparent)` }} />
              {editing?.level === tier.level && editing.kind === 'price' ? editor(tier, 'price') : (
                <button
                  type="button"
                  disabled={!onUpdate}
                  aria-label={`修改 ${d.target.symbol} 档${tier.level}锚价`}
                  title={manual ? '手动价格，点击修改' : '点击输入手动价格'}
                  onClick={() => startEdit(tier, 'price')}
                  className="relative z-10 inline-flex items-center gap-0.5 font-medium hover:underline disabled:no-underline"
                  style={{ color }}
                >
                  {NUM(tier.price)}<Pencil className="h-2.5 w-2.5 opacity-60" />
                </button>
              )}
              {manual && onUpdate && (
                <button
                  type="button"
                  aria-label={`恢复 ${d.target.symbol} 档${tier.level}自动锚价`}
                  title="手动价格 · 点击恢复自动计算"
                  onClick={() => {
                    finished.current = true;
                    setEditing(null);
                    setError('');
                    const next = prices();
                    next[tier.level - 1] = null;
                    onUpdate(d.target.id, { tierPrices: next });
                  }}
                  className="relative z-10 text-muted-foreground hover:text-foreground"
                ><RotateCcw className="h-3 w-3" /></button>
              )}
              {tier.level !== 1 && (editing?.level === tier.level && editing.kind === 'ratio' ? editor(tier, 'ratio') : (
                <button
                  type="button"
                  disabled={!onUpdate}
                  aria-label={`修改 ${d.target.symbol} 档${tier.level}下跌比例`}
                  onClick={() => startEdit(tier, 'ratio')}
                  title="编辑相对档1的下跌比例，恢复本档按比例计算"
                  className="relative z-10 inline-flex items-center gap-0.5 text-[10px] opacity-70 hover:opacity-100"
                >{relativeLabel}<Pencil className="h-2.5 w-2.5" /></button>
              ))}
            </span>
          );
        })}
      </div>
      {error && <span role="alert" className="text-[11px] text-negative">{error}</span>}
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
    <TableHead className={className} aria-sort={active ? asc ? 'ascending' : 'descending' : 'none'}>
      <button
        type="button"
        onClick={() => onSort(k)}
        title={k === 'pnlUsd' ? '按盈亏金额排序（USD）' : undefined}
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
  onDelete,
}: {
  derived: DerivedTarget[];
  sectorColors: ReadonlyMap<string, string>;
  activeSector?: string | null;
  onUpdate?: (id: string, updates: AnchorUpdates) => void;
  onDelete: (id: string) => void;
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

  const rows = useMemo(
    () => sortTargets(derived, sortKey, asc, activeSector),
    [derived, sortKey, asc, activeSector]
  );

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
            <SortHeader label="盈亏" k="pnlUsd" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <TableHead className="text-right">今日%</TableHead>
            <TableHead className="text-right">数量</TableHead>
            <SortHeader label="现有仓位" k="currentValue" sortKey={sortKey} asc={asc} onSort={onSort} className="text-right" />
            <TableHead className="text-right" title="每股成本，与现价使用相同币种；多账户按持股数量加权">成本价</TableHead>
            <TableHead className="text-right">现价</TableHead>
            <SortHeader label="三档锚价" k="tier" sortKey={sortKey} asc={asc} onSort={onSort} />
            <TableHead className="w-10">
              <span className="sr-only">操作</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => {
            const sectorColor =
              sectorColors.get(d.target.sector || '未分类') ?? 'var(--chart-1)';
            const sectorActive =
              !!activeSector && d.target.sector === activeSector;
            const sectorDimmed =
              !!activeSector && d.target.sector !== activeSector;
            return (
            <TableRow
              key={d.target.id}
              className={cn(
                'transition-opacity',
                sectorDimmed && 'opacity-40'
              )}
              style={{
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
                      className="rounded bg-primary/15 px-1 py-0.5 text-[10px] text-primary"
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
                  <span className={d.pnlUsd >= 0 ? 'text-positive' : 'text-negative'}>
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
                  <span className={d.changePct >= 0 ? 'text-positive' : 'text-negative'}>
                    {d.changePct >= 0 ? '+' : ''}
                    {d.changePct.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.quantities.length ? d.quantities.map((quantity, index) => <div key={index} title={quantity.source}>
                  {hidden ? '****' : QUANTITY(quantity.amount)} {quantity.unit}{quantity.label && <span className="ml-1 text-xs text-muted-foreground">{quantity.label}</span>}
                </div>) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.isHeld ? hidden ? '****' : fmtUsd(d.currentValue) : '—'}
                {!!d.mappedSources?.length && <p className="max-w-48 whitespace-normal text-[10px] text-muted-foreground" title={d.mappedSources.join('；')}>含标记美股 · {d.mappedSources.join(' / ')}</p>}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.costBasisLocal !== null
                  ? <span title="复用资产看板持仓成本；多账户按持股数量加权">{hidden ? '****' : formatCurrency(d.costBasisLocal, MARKET_CURRENCY[d.target.market])}</span>
                  : <span className="text-muted-foreground" title="暂无完整的股票成本数据">—</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.livePrice !== null ? (
                  <span className="inline-flex flex-col items-end">
                    <span>{formatCurrency(d.livePrice, MARKET_CURRENCY[d.target.market])}</span>
                    <PriceAge updatedAt={d.priceUpdatedAt} source={d.priceSource} status={d.priceStatus} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">无报价</span>
                )}
              </TableCell>
              <TableCell>
                <TierCell d={d} onUpdate={onUpdate} />
              </TableCell>
              <TableCell className="pr-2 text-right">
                <button
                  type="button"
                  onClick={() => {
                    const label = displayName(
                      d.target.market,
                      d.target.symbol,
                      d.name
                    );
                    if (window.confirm(`确定从加仓计划中删除 ${label} 吗？`)) {
                      onDelete(d.target.id);
                    }
                  }}
                  aria-label={`从加仓计划中删除 ${d.target.symbol}`}
                  title="删除标的"
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-negative/10 hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
