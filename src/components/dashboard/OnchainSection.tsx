'use client';

import { truncateAddress } from '@/lib/format';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { AssetTable } from './AssetTable';
import { DefiPositions } from './DefiPositions';
import type { WalletBalance } from '@/types/onchain';
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ONCHAIN_WARNING_MS } from '@/lib/onchain/cachePolicy';

const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'ETH',
  optimism: 'OP',
  arbitrum: 'ARB',
  base: 'Base',
  bsc: 'BSC',
  plasma: 'Plasma',
  hyperliquid: 'Hyperliquid',
  robinhood: 'Robinhood',
  solana: 'SOL',
  bitcoin: 'BTC',
};

interface OnchainSectionProps {
  wallets: WalletBalance[];
  isLoading: boolean;
  error?: Error | null;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

function dataAge(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes === 0) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / (24 * 60))} 天前`;
}

export function OnchainSection({ wallets, isLoading, error, isRefreshing, onRefresh }: OnchainSectionProps) {
  const { fmtUsd } = usePrivacyFormat();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const refreshing = isRefreshing || wallets.some((wallet) => wallet.cache?.refreshing);
  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (wallets.length === 0 && error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (wallets.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          暂未添加钱包，请在设置页面添加链上钱包地址
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" title="打开页面后检查缓存，超过 10 分钟时触发更新；关闭页面后不会定时查询。">缓存有效期 10 分钟 · 服务端保留 7 天 · 本地保留 30 天</p>
        {onRefresh && <Button size="sm" variant="outline" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
          {refreshing ? '正在更新' : '刷新链上资产'}
        </Button>}
      </div>
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          刷新失败，继续显示上次成功数据：{error.message}
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
      {wallets.map((wallet) => (
        <div key={wallet.walletId} className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">{wallet.walletName}</h3>
              <p className="text-xs text-muted-foreground font-mono">
                {truncateAddress(wallet.address)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                {(wallet.chains ?? []).map((c: string) => CHAIN_LABELS[c] ?? c).join(' / ')}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {wallet.error && !wallet.dataUpdatedAt ? '—' : fmtUsd(wallet.totalUsdValue)}
              </span>
            </div>
          </div>
          {wallet.dataUpdatedAt && <p
            className={`mb-3 text-xs ${now - wallet.dataUpdatedAt > ONCHAIN_WARNING_MS ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}
            title={new Date(wallet.dataUpdatedAt).toLocaleString()}
          >
            数据更新于 {dataAge(wallet.dataUpdatedAt, now)}
            {wallet.cache?.source !== 'live' && ' · 缓存'}
            {now - wallet.dataUpdatedAt > ONCHAIN_WARNING_MS && ' · 数据已过期'}
            {wallet.cache?.refreshing && ' · 后台更新中'}
          </p>}
          {wallet.cache?.refreshError && <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
            更新失败，显示上次成功数据：{wallet.cache.refreshError}
          </p>}
          {wallet.error ? (
            <p className="text-sm text-destructive">{wallet.error}</p>
          ) : (
            <>
              {wallet.dataQuality?.complete === false && wallet.dataQuality.errors.length > 0 && (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">
                  数据不完整：{wallet.dataQuality.errors.join('；')}
                </p>
              )}
              <AssetTable balances={wallet.balances} />
              {wallet.defiPositions && wallet.defiPositions.length > 0 && (
                <DefiPositions
                  positions={wallet.defiPositions}
                  totalUsdValue={wallet.defiTotalUsdValue ?? 0}
                />
              )}
            </>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}
