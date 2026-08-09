'use client';

import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { cn } from '@/lib/utils';
import { AssetTable } from './AssetTable';
import type { AssetBalance } from '@/types/common';

interface SubAccount {
  label: string;
  balances: AssetBalance[];
  totalUsdValue: number;
  error?: string;
}

interface FuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  positionSide: string;
  notional: string;
}

interface GridBotSummary {
  algoId: number;
  symbol: string;
  direction: string;
  investedAmt: number;
  totalPnl: number;
}

interface ExchangeDataWithAccounts {
  configured?: boolean;
  exchange: string;
  accounts?: SubAccount[];
  futuresPositions?: FuturesPosition[];
  gridBots?: GridBotSummary[];
  balances: AssetBalance[];
  totalUsdValue: number;
  lastUpdated: string;
  dataQuality?: {
    complete: boolean;
    errors: string[];
  };
  error?: string;
}

interface ExchangeSectionProps {
  binance: { data?: ExchangeDataWithAccounts; isLoading: boolean; error?: Error | null };
  okx: { data?: ExchangeDataWithAccounts; isLoading: boolean; error?: Error | null };
}

function FuturesPositionsTable({ positions }: { positions: FuturesPosition[] }) {
  const { fmtUsd, fmtCrypto, hidden } = usePrivacyFormat();
  if (positions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">
          合约持仓
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">合约</th>
              <th className="pb-2 font-medium">方向</th>
              <th className="pb-2 text-right font-medium">数量</th>
              <th className="pb-2 text-right font-medium">开仓价</th>
              <th className="pb-2 text-right font-medium">标记价</th>
              <th className="pb-2 text-right font-medium">未实现盈亏</th>
              <th className="pb-2 text-right font-medium">杠杆</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const amt = parseFloat(pos.positionAmt);
              const pnl = parseFloat(pos.unRealizedProfit);
              const isLong = amt > 0;
              return (
                <tr key={pos.symbol + pos.positionSide} className="border-b last:border-0">
                  <td className="py-2 font-medium">{pos.symbol}</td>
                  <td className="py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        isLong
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-red-500/10 text-red-600 dark:text-red-400'
                      )}
                    >
                      {isLong ? '多' : '空'}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtCrypto(Math.abs(amt), 4)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtCrypto(parseFloat(pos.entryPrice), 2)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtCrypto(parseFloat(pos.markPrice), 2)}
                  </td>
                  <td
                    className={cn(
                      'py-2 text-right tabular-nums font-medium',
                      pnl >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {hidden ? '' : pnl >= 0 ? '+' : ''}
                    {fmtUsd(pnl)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {pos.leverage}x
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GridBotsTable({ bots }: { bots: GridBotSummary[] }) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  if (bots.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">
          合约网格机器人
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">合约</th>
              <th className="pb-2 font-medium">方向</th>
              <th className="pb-2 text-right font-medium">投入保证金</th>
              <th className="pb-2 text-right font-medium">总盈亏</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((bot) => {
              const isShort = bot.direction === 'SHORT';
              return (
                <tr key={bot.algoId} className="border-b last:border-0">
                  <td className="py-2 font-medium">{bot.symbol}</td>
                  <td className="py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        isShort
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                          : 'bg-green-500/10 text-green-600 dark:text-green-400'
                      )}
                    >
                      {isShort ? '做空网格' : '做多网格'}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {fmtUsd(bot.investedAmt)}
                  </td>
                  <td
                    className={cn(
                      'py-2 text-right tabular-nums font-medium',
                      bot.totalPnl >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {hidden ? '' : bot.totalPnl >= 0 ? '+' : ''}
                    {fmtUsd(bot.totalPnl)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExchangeCard({
  data,
  isLoading,
  error,
  name,
}: {
  data?: ExchangeDataWithAccounts;
  isLoading: boolean;
  error?: Error | null;
  name: string;
}) {
  const { fmtUsd } = usePrivacyFormat();
  const hasSubAccounts = data?.accounts && data.accounts.length > 0;
  const hasPositions = data?.futuresPositions && data.futuresPositions.length > 0;
  const hasGridBots = data?.gridBots && data.gridBots.length > 0;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{name}</h3>
        {data?.error ? (
          <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
            Error
          </span>
        ) : (
          !isLoading &&
          data && (
            <span className="text-sm font-medium text-muted-foreground">
              {fmtUsd(data.totalUsdValue)}
            </span>
          )
        )}
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          刷新失败，继续显示上次成功数据：{error.message}
        </div>
      )}
      {data?.dataQuality?.complete === false && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          数据不完整：{data.dataQuality.errors.join('；')}
        </div>
      )}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : data?.error ? (
        <p className="text-sm text-destructive">{data.error}</p>
      ) : (
        <div className="space-y-4">
          {hasSubAccounts &&
            data.accounts!.map((account) => (
              <div key={account.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    {account.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtUsd(account.totalUsdValue)}
                  </span>
                </div>
                {account.error ? (
                  <p className="text-xs text-destructive">{account.error}</p>
                ) : (
                  <AssetTable balances={account.balances} />
                )}
              </div>
            ))}
          {hasPositions && (
            <FuturesPositionsTable positions={data.futuresPositions!} />
          )}
          {hasGridBots && (
            <GridBotsTable bots={data.gridBots!} />
          )}
          {!hasSubAccounts && !hasPositions && !hasGridBots && data && (
            <AssetTable balances={data.balances} />
          )}
        </div>
      )}
    </div>
  );
}

export function ExchangeSection({ binance, okx }: ExchangeSectionProps) {
  const cards = [
    { data: binance.data, isLoading: binance.isLoading, error: binance.error, name: 'Binance' },
    { data: okx.data, isLoading: okx.isLoading, error: okx.error, name: 'OKX' },
  ].filter((c) => c.isLoading || c.data?.configured !== false);

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        未配置任何交易所 API，请在环境变量中添加对应的 API Key。
      </p>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {cards.map((c) => (
        <ExchangeCard
          key={c.name}
          data={c.data}
          isLoading={c.isLoading}
          error={c.error}
          name={c.name}
        />
      ))}
    </div>
  );
}
