'use client';

import { useMemo } from 'react';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { PriceAge } from '@/components/common/PriceAge';
import { deriveOptionExposure, summarizeOptionExposure } from '@/lib/stocks/optionExposure';
import { BROKER_LABEL, type EnrichedPosition, type FxRates, type StockQuote } from '@/types/stocks';
import { formatCurrency } from '@/lib/format';

const MONEYNESSES = { itm: '实值', otm: '虚值', atm: '平值' };

export function OptionExposurePanel({ positions, quotes, fx }: {
  positions: EnrichedPosition[]; quotes: StockQuote[]; fx: FxRates | undefined;
}) {
  const { hidden, fmtUsd } = usePrivacyFormat();
  const rows = useMemo(() => deriveOptionExposure(positions, quotes, fx), [positions, quotes, fx]);
  const total = useMemo(() => summarizeOptionExposure(rows), [rows]);
  const amount = (n: number | null) => n === null ? '—' : fmtUsd(n);
  if (rows.length === 0) return null;
  return (
    <section aria-label="股票期权敞口" className="min-w-0 rounded-lg border bg-card p-4">
      <div className="mb-4 space-y-1">
        <h2 className="font-semibold">股票期权敞口</h2>
        <p className="text-xs text-muted-foreground">按标的现价与行权价区分实值、虚值，展示各类合约对应的标的名义金额。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['itm', 'otm'] as const).map(kind => {
          const bucket = total[kind];
          return <div key={kind} className="rounded-md bg-muted/40 p-4" data-exposure-bucket={kind}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">{MONEYNESSES[kind]}</h3>
              <span className="text-xs text-muted-foreground">{bucket.count} 项持仓{bucket.atmCount > 0 && ` · 含平值 ${bucket.atmCount} 项`}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{amount(bucket.notionalUsd)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{total.unclassified.length > 0 ? '已分类名义金额 (USD)' : '名义敞口 (USD)'}</p>
            {bucket.notionalUsd === null && <p className="mt-1 text-xs text-warning dark:text-warning">数据待补全 · 已知小计 {amount(bucket.knownNotionalUsd)}</p>}
          </div>;
        })}
      </div>
      {total.covered < total.count && <p role="status" className="mt-3 text-xs text-warning dark:text-warning">
        已完整计算 {total.covered}/{total.count} 项持仓，两类汇总尚不完整。
        {total.unclassified.length > 0 && `另有 ${total.unclassified.length} 项无法分类，未计入上方金额。`}
      </p>}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">查看合约明细（{rows.length}）</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[740px] text-xs">
            <thead><tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">合约</th><th className="pb-2 font-medium">实值 / 虚值</th>
              <th className="pb-2 text-right font-medium">持仓 / 乘数</th><th className="pb-2 text-right font-medium">标的价 / 行权价</th>
              <th className="pb-2 text-right font-medium">对应标的数量</th><th className="pb-2 text-right font-medium">名义敞口 (USD)</th>
            </tr></thead>
            <tbody>{rows.map(row => <tr key={`${row.position.broker}:${row.position.id}`} className="border-b last:border-0" data-option-id={row.position.id} data-moneyness={row.moneyness ?? 'unknown'}>
              <td className="py-3 pr-3">
                <div className="font-medium">{row.position.symbol} {row.contract.optionType === 'call' ? 'Call' : row.contract.optionType === 'put' ? 'Put' : '期权'}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">{row.contract.expiry ?? row.position.name ?? '到期日未提供'} · {BROKER_LABEL[row.position.broker]}</div>
                {row.missing.length > 0 && <div className="mt-1 text-[10px] text-warning dark:text-warning">{row.missing.join(' · ')}</div>}
              </td>
              <td><span className="rounded bg-secondary px-1.5 py-0.5">{row.moneyness ? MONEYNESSES[row.moneyness] : '待分类'}</span></td>
              <td className="text-right tabular-nums">{hidden ? '****' : `${row.position.shares < 0 ? '卖出' : '买入'} ${Math.abs(row.position.shares)} 张`}<div className="mt-1 text-[10px] text-muted-foreground">乘数 {row.position.multiplier ?? '未提供'}</div></td>
              <td className="py-3 text-right tabular-nums">
                <div className="flex flex-col items-end gap-0.5">
                  <span>{hidden ? '****' : row.underlying ? formatCurrency(row.underlying.price, row.underlying.currency) : '—'} / {hidden ? '****' : row.contract.strike !== undefined ? formatCurrency(row.contract.strike, row.underlying?.currency ?? row.position.currency) : '—'}</span>
                  {row.underlying && <PriceAge updatedAt={row.underlying.priceUpdatedAt} source={row.underlying.priceSource} status={row.underlying.priceStatus} />}
                </div>
              </td>
              <td className="text-right tabular-nums">{row.underlyingQuantity === null ? '—' : hidden ? '****' : `${row.underlyingQuantity.toLocaleString('en-US', { maximumFractionDigits: 8 })} 股`}</td>
              <td className="text-right font-medium tabular-nums">{amount(row.notionalUsd)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="mt-3 text-[11px] text-muted-foreground">名义金额 = 张数绝对值 × 合约乘数 × 标的现价（折 USD），买卖持仓不抵消。平值与虚值合并汇总，明细单独标注。此金额表示合约规模，不代表权利金、最大亏损或 Delta 方向敞口。</p>
    </section>
  );
}
