'use client';

import { truncateAddress } from '@/lib/format';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { AssetTable } from './AssetTable';
import { DefiPositions } from './DefiPositions';
import type { WalletBalance } from '@/types/onchain';

const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'ETH',
  optimism: 'OP',
  arbitrum: 'ARB',
  base: 'Base',
  bsc: 'BSC',
  solana: 'SOL',
};

interface OnchainSectionProps {
  wallets: WalletBalance[];
  isLoading: boolean;
  error?: Error | null;
}

export function OnchainSection({ wallets, isLoading, error }: OnchainSectionProps) {
  const { fmtUsd } = usePrivacyFormat();
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
                {fmtUsd(wallet.totalUsdValue)}
              </span>
            </div>
          </div>
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
