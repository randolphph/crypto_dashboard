'use client';

import { useState } from 'react';
import { Lock, Wallet, AlertTriangle } from 'lucide-react';
import { useVaultStore } from '@/stores/vaultStore';
import { loginVault, resetVault } from '@/lib/auth/vault';

export function VaultGate({ children }: { children: React.ReactNode }) {
  const status = useVaultStore((s) => s.status);
  const error = useVaultStore((s) => s.error);
  const [confirmReset, setConfirmReset] = useState(false);

  if (status === 'authed') return <>{children}</>;

  if (status === 'pending') {
    // Bootstrap still running; hold the gate without showing the login screen
    // to avoid flashing it during the (usually brief) silent session restore.
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  const isUnlocking = status === 'unlocking';

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Lock className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">钱包登录</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          用 EVM 钱包签名登录看板。所有 API 凭证用钱包派生的密钥加密保存在本地，
          只有签名匹配的钱包才能解锁。
        </p>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={() => {
            void loginVault().catch(() => {});
          }}
          disabled={isUnlocking}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <Wallet className="h-4 w-4" />
          {isUnlocking ? '签名中…' : '连接钱包登录'}
        </button>

        <div className="mt-6 border-t pt-4 text-xs text-muted-foreground">
          {confirmReset ? (
            <div className="space-y-2">
              <p className="text-destructive">
                确定清空所有加密凭证？此操作不可恢复，下次登录需要重填 API key。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    resetVault();
                    setConfirmReset(false);
                  }}
                  className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  确认重置
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="rounded-md border px-3 py-1.5 text-xs"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              丢了钱包？重置并清空凭证
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
