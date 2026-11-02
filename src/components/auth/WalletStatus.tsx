'use client';

import { LogOut, Wallet, X } from 'lucide-react';
import { useVaultStore } from '@/stores/vaultStore';
import { loginVault, logoutVault } from '@/lib/auth/vault';
import { truncateAddress } from '@/lib/format';

export function WalletStatus() {
  const status = useVaultStore((s) => s.status);
  const address = useVaultStore((s) => s.address);
  const error = useVaultStore((s) => s.error);

  if (status !== 'authed' || !address) {
    // Development keeps the dashboard accessible without a wallet. Offer
    // login here because the full-screen gate is skipped in that mode.
    if (process.env.NODE_ENV !== 'development') return null;

    const busy = status === 'pending' || status === 'unlocking';
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            void loginVault().catch(() => {});
          }}
          disabled={busy}
          aria-label={status === 'unlocking' ? '钱包签名中' : '连接钱包登录'}
          title={status === 'unlocking' ? '钱包签名中' : '连接钱包登录（可选）'}
          className="inline-flex items-center justify-center gap-1.5 rounded-md p-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <Wallet aria-hidden="true" className="h-4 w-4" />
          <span className="hidden lg:inline">{status === 'unlocking' ? '签名中…' : '连接钱包'}</span>
        </button>
        {error && (
          <div role="alert" className="absolute right-0 top-full z-[60] mt-2 flex w-72 max-w-[calc(100vw-1.5rem)] items-start gap-2 rounded-lg border border-destructive/30 bg-popover px-3 py-2 text-xs text-destructive shadow-lg">
            <span className="min-w-0 flex-1 break-words">{error}</span>
            <button type="button" aria-label="关闭钱包登录提示" onClick={() => useVaultStore.getState().setError(null)}
              className="shrink-0 rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className="hidden font-mono text-muted-foreground lg:inline">
        {truncateAddress(address)}
      </span>
      <button
        type="button"
        onClick={logoutVault}
        aria-label="退出钱包登录"
        title={`退出登录（${truncateAddress(address)}）`}
        className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
