'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  displayName,
  type DerivedTarget,
} from '@/lib/accumulation/derive';
import { MARKET_CURRENCY } from '@/types/stocks';
import { formatCurrency } from '@/lib/format';
import { sortTargets, type TargetSortKey as SortKey } from '@/lib/accumulation/sort';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { cn } from '@/lib/utils';
import { StockLogo } from './StockLogo';
import { PriceAge } from '@/components/common/PriceAge';
import { PositionLimitCell } from './PositionLimitCell';
import { derivePositionLimit } from '@/lib/accumulation/positionLimit';

const QUANTITY = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 8 });

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
    <TableHead className={cn('text-center', className)} aria-sort={active ? asc ? 'ascending' : 'descending' : 'none'}>
      <button
        type="button"
        onClick={() => onSort(k)}
        title={k === 'pnlUsd' ? '按盈亏金额排序（USD）' : k === 'changePct' ? '按今日涨跌幅排序' : undefined}
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
  totalPortfolioUsd,
  onLimitChange,
  onDelete,
}: {
  derived: DerivedTarget[];
  sectorColors: ReadonlyMap<string, string>;
  activeSector?: string | null;
  totalPortfolioUsd: number;
  onLimitChange: (id: string, share: number | undefined) => void;
  onDelete: (id: string) => void;
}) {
  const { fmtUsd, hidden, percentHidden } = usePrivacyFormat();
  const [sortKey, setSortKey] = useState<SortKey>('currentValue');
  const [asc, setAsc] = useState(false);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      // Text columns read naturally in ascending order; numeric
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
    <div>
      <div className="rounded-lg border overflow-x-auto">
      <Table className="text-center">
        <caption aria-label="整行仓位进度刻度" className="relative h-0 caption-top text-muted-foreground">
          {[30, 70].map(value => <span key={value} data-limit-marker={value} role="img" aria-label={`${value}%进度`} title={`${value}%进度`} className="absolute top-0 z-10 inline-flex -translate-x-1/2" style={{ left: `${value}%` }}>
            <svg aria-hidden viewBox="0 0 8 5" className="h-[5px] w-2"><path d="M0 0h8L4 5Z" fill="currentColor" /></svg>
          </span>)}
        </caption>
        <TableHeader>
          <TableRow>
            <SortHeader label="标的" k="symbol" sortKey={sortKey} asc={asc} onSort={onSort} />
            <SortHeader label="现有仓位" k="currentValue" sortKey={sortKey} asc={asc} onSort={onSort} className="text-center" />
            <TableHead className="text-center" title="当前仓位占总资产的比例 / 设置的仓位上限；整行背景填充为当前仓位相对上限的使用比例">仓位上限</TableHead>
            <SortHeader label="盈亏" k="pnlUsd" sortKey={sortKey} asc={asc} onSort={onSort} className="text-center" />
            <SortHeader label="今日%" k="changePct" sortKey={sortKey} asc={asc} onSort={onSort} />
            <TableHead className="text-center">现价</TableHead>
            <TableHead className="text-center" title="每股成本，与现价使用相同币种；多账户按持股数量加权">成本价</TableHead>
            <TableHead className="text-center">数量</TableHead>
            <SortHeader label="板块" k="sector" sortKey={sortKey} asc={asc} onSort={onSort} />
            <TableHead className="w-10 text-center">
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
            const positionLimit = derivePositionLimit(d.currentValue, totalPortfolioUsd, d.target.positionLimitShare);
            const progress = percentHidden ? null : positionLimit.progress;
            const fill = `color-mix(in srgb, var(--${positionLimit.band === 'low' ? 'positive' : positionLimit.band === 'medium' ? 'warning' : 'negative'}) var(--accumulation-tier-fill-opacity), transparent)`;
            return (
            <TableRow
              key={d.target.id}
              data-limit-row={d.target.symbol}
              data-limit-progress={progress ?? undefined}
              className={cn(
                'transition-opacity',
                sectorDimmed && 'opacity-40'
              )}
              style={{
                backgroundImage: progress !== null ? `linear-gradient(to right, ${fill} ${progress * 100}%, transparent ${progress * 100}%)` : undefined,
                boxShadow: sectorActive
                  ? `inset 3px 0 0 ${sectorColor}`
                  : undefined,
              }}
            >
              <TableCell>
                <div className="flex items-center justify-center gap-1.5">
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
              <TableCell className="text-center tabular-nums">
                {d.isHeld ? hidden ? '****' : fmtUsd(d.currentValue) : '—'}
                {!!d.mappedSources?.length && <p className="mx-auto max-w-48 whitespace-normal text-[10px] text-muted-foreground" title={d.mappedSources.join('；')}>含标记美股 · {d.mappedSources.join(' / ')}</p>}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                <PositionLimitCell symbol={d.target.symbol} currentValue={d.currentValue} totalPortfolioUsd={totalPortfolioUsd} limitShare={d.target.positionLimitShare} onChange={share => onLimitChange(d.target.id, share)} />
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {d.pnlUsd !== null ? (
                  <span className={d.pnlUsd >= 0 ? 'text-positive' : 'text-negative'}>
                    {hidden ? '****' : `${d.pnlUsd >= 0 ? '+' : ''}${fmtUsd(d.pnlUsd)}`}
                    {d.pnlPct !== null && !percentHidden && (
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
              <TableCell className="text-center tabular-nums">
                {d.changePct !== null ? (
                  <span className={d.changePct >= 0 ? 'text-positive' : 'text-negative'}>
                    {percentHidden ? '**%' : `${d.changePct >= 0 ? '+' : ''}${d.changePct.toFixed(2)}%`}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {d.livePrice !== null ? (
                  <span className="inline-flex flex-col items-center">
                    <span>{hidden ? '****' : formatCurrency(d.livePrice, MARKET_CURRENCY[d.target.market])}</span>
                    <PriceAge updatedAt={d.priceUpdatedAt} source={d.priceSource} status={d.priceStatus} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">无报价</span>
                )}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {d.costBasisLocal !== null
                  ? <span title="复用资产看板持仓成本；多账户按持股数量加权">{hidden ? '****' : formatCurrency(d.costBasisLocal, MARKET_CURRENCY[d.target.market])}</span>
                  : <span className="text-muted-foreground" title="暂无完整的股票成本数据">—</span>}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {d.quantities.length ? d.quantities.map((quantity, index) => <div key={index} title={quantity.source}>
                  {hidden ? '****' : QUANTITY(quantity.amount)} {quantity.unit}{quantity.label && <span className="ml-1 text-xs text-muted-foreground">{quantity.label}</span>}
                </div>) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {d.target.sector || '—'}
              </TableCell>
              <TableCell className="px-2 text-center">
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
    </div>
  );
}
