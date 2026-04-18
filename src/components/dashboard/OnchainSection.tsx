'use client';

import { formatUsd, truncateAddress } from '@/lib/format';
import { AssetTable } from './AssetTable';
import type { WalletBalance } from '@/types/onchain';

const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'ETH',
  optimism: 'OP',
  arbitrum: 'ARB',
  base: 'Base',
  solana: 'SOL',
};

interface OnchainSectionProps {
  wallets: WalletBalance[];
  isLoading: boolean;
}

export function OnchainSection({ wallets, isLoading }: OnchainSectionProps) {
  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
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
                {formatUsd(wallet.totalUsdValue)}
              </span>
            </div>
          </div>
          {wallet.error ? (
            <p className="text-sm text-destructive">{wallet.error}</p>
          ) : (
            <AssetTable balances={wallet.balances} />
          )}
        </div>
      ))}
    </div>
  );
}
