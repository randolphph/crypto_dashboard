'use client';

import { LogOut } from 'lucide-react';
import { useVaultStore } from '@/stores/vaultStore';
import { logoutVault } from '@/lib/auth/vault';
import { truncateAddress } from '@/lib/format';

export function WalletStatus() {
  const status = useVaultStore((s) => s.status);
  const address = useVaultStore((s) => s.address);

  if (status !== 'authed' || !address) return null;

  return (
    <div className="hidden md:flex items-center gap-2 text-xs">
      <span className="font-mono text-muted-foreground">
        {truncateAddress(address)}
      </span>
      <button
        onClick={logoutVault}
        title="退出登录"
        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
