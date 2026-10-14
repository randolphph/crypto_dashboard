'use client';

import { useEffect, useState } from 'react';
import { bootstrapVault } from '@/lib/auth/vault';
import { recoverAShareTrade } from '@/lib/stocks/saveManualTrade';

export function VaultBootstrap() {
  const [recoveryError, setRecoveryError] = useState(false);
  useEffect(() => {
    void bootstrapVault().then(() => {
      try { recoverAShareTrade(); } catch { setRecoveryError(true); }
    });
  }, []);
  return recoveryError ? <div role="alert" className="border-b bg-destructive/5 px-6 py-2 text-sm text-destructive">上次 A 股交易尚未保存完整。<button className="ml-2 underline" onClick={() => { try { recoverAShareTrade(); setRecoveryError(false); } catch { setRecoveryError(true); } }}>重试恢复</button></div> : null;
}
