'use client';

import { useState } from 'react';
import { Wallet, AlertTriangle } from 'lucide-react';
import { useVaultStore } from '@/stores/vaultStore';
import { loginVault, resetVault } from '@/lib/auth/vault';
import { BlockchainBackdrop } from './BlockchainBackdrop';

export function VaultGate({ children }: { children: React.ReactNode }) {
  const status = useVaultStore((s) => s.status);
  const error = useVaultStore((s) => s.error);
  const [confirmReset, setConfirmReset] = useState(false);

  if (status === 'authed') return <>{children}</>;

  if (status === 'pending') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  const isUnlocking = status === 'unlocking';

  return (
    // Escape <main>'s padding so the backdrop reaches every edge under the
    // header. 3.5rem keeps it just under the sticky header.
    <div className="relative -m-6 overflow-hidden min-h-[calc(100vh-3.5rem)]">
      <BlockchainBackdrop />

      {/* Top-right login button */}
      <div className="absolute right-6 top-6 z-10 flex flex-col items-end gap-2">
        <button
          onClick={() => {
            void loginVault().catch(() => {});
          }}
          disabled={isUnlocking}
          className="inline-flex items-center gap-2 rounded-lg border border-foreground/80 bg-background/80 px-4 py-2 text-sm font-medium backdrop-blur hover:bg-foreground hover:text-background disabled:opacity-60 transition-colors"
        >
          <Wallet className="h-4 w-4" />
          {isUnlocking ? '签名中…' : '连接钱包登录'}
        </button>
        {error && (
          <div className="flex max-w-xs items-start gap-2 rounded-lg border border-destructive/40 bg-background/90 px-3 py-2 text-xs text-destructive backdrop-blur">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Bottom-right reset (small, low-key) */}
      <div className="absolute bottom-4 right-6 z-10 text-[11px] text-muted-foreground">
        {confirmReset ? (
          <div className="flex items-center gap-2 rounded-lg border bg-background/90 px-3 py-1.5 backdrop-blur">
            <span className="text-destructive">确认重置？凭证会全部清空</span>
            <button
              onClick={() => {
                resetVault();
                setConfirmReset(false);
              }}
              className="rounded-md bg-destructive px-2 py-0.5 text-[11px] font-medium text-destructive-foreground"
            >
              确认
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="rounded-md border px-2 py-0.5 text-[11px]"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="rounded px-1 hover:text-destructive transition-colors"
          >
            丢了钱包？重置
          </button>
        )}
      </div>
    </div>
  );
}
