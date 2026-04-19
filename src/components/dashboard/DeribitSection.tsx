'use client';

import { formatUsd, formatCrypto } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DeribitData } from '@/types/deribit';

interface DeribitSectionProps {
  data?: DeribitData;
  isLoading: boolean;
}

export function DeribitSection({ data, isLoading }: DeribitSectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (data?.configured === false) {
    return (
      <p className="text-sm text-muted-foreground">
        未配置 Deribit API，请在环境变量中添加 DERIBIT_CLIENT_ID 和 DERIBIT_CLIENT_SECRET。
      </p>
    );
  }

  if (data?.error) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm text-destructive">{data.error}</p>
      </div>
    );
  }

  if (!data) return null;

  const totalEquityUsd = data.accountSummaries[0]?.total_equity_usd ?? 0;
  const prices = data.prices ?? {};

  function getCurrencyPrice(instrumentName: string): number {
    const currency = instrumentName.split('-')[0];
    return prices[currency] ?? 0;
  }

  const totalPnlUsd = data.positions.reduce(
    (sum, pos) => sum + pos.total_profit_loss * getCurrencyPrice(pos.instrument_name),
    0
  );

  return (
    <div className="space-y-6">
      {/* Total Account Value */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">账户总价值 (跨币种组合保证金)</p>
        <p className="text-2xl font-bold tabular-nums">{formatUsd(totalEquityUsd)}</p>
      </div>

      {/* Account Summaries */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.accountSummaries.map((summary) => (
          <div key={summary.currency} className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="font-semibold text-lg mb-3">{summary.currency} 账户</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">保证金余额</p>
                <p className="font-medium tabular-nums">
                  {formatCrypto(summary.margin_balance)} {summary.currency}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">权益</p>
                <p className="font-medium tabular-nums">
                  {formatCrypto(summary.equity)} {summary.currency}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">初始保证金</p>
                <p className="font-medium tabular-nums">
                  {formatCrypto(summary.initial_margin)} {summary.currency}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">维持保证金</p>
                <p className="font-medium tabular-nums">
                  {formatCrypto(summary.maintenance_margin)} {summary.currency}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Options Positions */}
      {data.positions.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold text-lg mb-4">期权持仓</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">合约</th>
                  <th className="pb-2 font-medium">方向</th>
                  <th className="pb-2 text-right font-medium">数量</th>
                  <th className="pb-2 text-right font-medium">均价</th>
                  <th className="pb-2 text-right font-medium">标记价</th>
                  <th className="pb-2 text-right font-medium">总盈亏</th>
                  <th className="pb-2 text-right font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {data.positions.map((pos) => (
                  <tr key={pos.instrument_name} className="border-b last:border-0">
                    <td className="py-2 font-medium">{pos.instrument_name}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          pos.direction === 'buy'
                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400'
                        )}
                      >
                        {pos.direction === 'buy' ? '买' : '卖'}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCrypto(Math.abs(pos.size), 4)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCrypto(pos.average_price, 4)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCrypto(pos.mark_price, 4)}
                    </td>
                    <td
                      className={cn(
                        'py-2 text-right tabular-nums font-medium',
                        pos.total_profit_loss >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {pos.total_profit_loss >= 0 ? '+' : ''}
                      {formatUsd(pos.total_profit_loss * getCurrencyPrice(pos.instrument_name))}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {pos.delta.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={5} className="py-2 font-semibold text-right">总盈亏</td>
                  <td
                    className={cn(
                      'py-2 text-right tabular-nums font-semibold',
                      totalPnlUsd >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {totalPnlUsd >= 0 ? '+' : ''}{formatUsd(totalPnlUsd)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
