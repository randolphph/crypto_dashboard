'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useReceiptTokenStore } from '@/stores/receiptTokenStore';

const CHAIN_OPTIONS: { chainId: string; label: string }[] = [
  { chainId: '1', label: 'Ethereum' },
  { chainId: '10', label: 'Optimism' },
  { chainId: '42161', label: 'Arbitrum' },
  { chainId: '8453', label: 'Base' },
  { chainId: '56', label: 'BSC' },
  { chainId: '501', label: 'Solana' },
];

const CHAIN_BADGE: Record<string, string> = {
  '1': 'ETH',
  '10': 'OP',
  '42161': 'ARB',
  '8453': 'Base',
  '56': 'BSC',
  '501': 'SOL',
};

function shortenAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function ReceiptTokenSettings() {
  const { entries, addEntry, removeEntry } = useReceiptTokenStore();
  const [chainId, setChainId] = useState('1');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');

  const handleAdd = () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    addEntry({
      chainId,
      tokenAddress: trimmed,
      label: label.trim() || undefined,
    });
    setAddress('');
    setLabel('');
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold">DeFi 凭证代币过滤</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        填入合约地址后，对应代币将从钱包余额中无条件剔除，避免与 DeFi 仓位重复计算。
        按地址过滤可避免误伤同名但不同协议的代币。
      </p>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_140px_auto]">
        <select
          value={chainId}
          onChange={(e) => setChainId(e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        >
          {CHAIN_OPTIONS.map((c) => (
            <option key={c.chainId} value={c.chainId}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && address.trim()) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="合约地址"
          className="rounded-lg border bg-background px-3 py-2 text-sm font-mono"
        />
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="备注（可选）"
          maxLength={32}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={!address.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          添加
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          名单为空，仅服务端默认过滤规则在生效
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={`${entry.chainId}:${entry.tokenAddress.toLowerCase()}`}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {CHAIN_BADGE[entry.chainId] ?? entry.chainId}
                  </span>
                  {entry.label && (
                    <span className="text-sm font-medium">{entry.label}</span>
                  )}
                </div>
                <p
                  className="mt-0.5 truncate font-mono text-xs text-muted-foreground"
                  title={entry.tokenAddress}
                >
                  {shortenAddress(entry.tokenAddress)}
                </p>
              </div>
              <button
                onClick={() => removeEntry(entry.chainId, entry.tokenAddress)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`移除 ${entry.label || entry.tokenAddress}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        共 {entries.length} 个 · 修改后会自动重新拉取链上数据
      </p>
    </div>
  );
}
