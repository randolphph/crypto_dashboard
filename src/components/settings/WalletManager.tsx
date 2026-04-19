'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { truncateAddress } from '@/lib/format';
import type { Chain, EvmChain, WalletConfig } from '@/types/onchain';

const EVM_CHAINS: { id: EvmChain; label: string }[] = [
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'optimism', label: 'Optimism' },
  { id: 'arbitrum', label: 'Arbitrum One' },
  { id: 'base', label: 'Base' },
  { id: 'bsc', label: 'BNB Chain' },
];

const CHAIN_LABELS: Record<Chain, string> = {
  ethereum: 'ETH',
  optimism: 'OP',
  arbitrum: 'ARB',
  base: 'Base',
  bsc: 'BSC',
  solana: 'SOL',
  bitcoin: 'BTC',
};

type WalletType = 'evm' | 'solana' | 'bitcoin';

function getWalletChains(wallet: WalletConfig): Chain[] {
  if (wallet.chains?.length) return wallet.chains;
  if (wallet.network) return [wallet.network];
  return ['ethereum'];
}

function getWalletType(chains: Chain[]): WalletType {
  if (chains.includes('bitcoin')) return 'bitcoin';
  if (chains.includes('solana')) return 'solana';
  return 'evm';
}

export function WalletManager() {
  const { wallets, addWallet, removeWallet, updateWallet } = useWalletStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [walletType, setWalletType] = useState<WalletType>('evm');
  const [selectedEvmChains, setSelectedEvmChains] = useState<EvmChain[]>(['ethereum']);

  const resetForm = () => {
    setName('');
    setAddress('');
    setWalletType('evm');
    setSelectedEvmChains(['ethereum']);
    setShowForm(false);
    setEditingId(null);
  };

  const handleEditWallet = (wallet: WalletConfig) => {
    const chains = getWalletChains(wallet);
    const type = getWalletType(chains);
    setEditingId(wallet.id);
    setName(wallet.name);
    setAddress(wallet.address);
    setWalletType(type);
    setSelectedEvmChains(
      type === 'evm' ? (chains as EvmChain[]) : ['ethereum']
    );
    setShowForm(true);
  };

  const handleSubmitWallet = () => {
    if (!name.trim() || !address.trim()) return;

    const chains: Chain[] =
      walletType === 'bitcoin'
        ? ['bitcoin']
        : walletType === 'solana'
          ? ['solana']
          : selectedEvmChains;

    if (editingId) {
      updateWallet(editingId, {
        name: name.trim(),
        address: address.trim(),
        chains,
      });
    } else {
      addWallet({
        id: crypto.randomUUID(),
        name: name.trim(),
        address: address.trim(),
        chains,
      });
    }

    resetForm();
  };

  const toggleEvmChain = (chain: EvmChain) => {
    setSelectedEvmChains((prev) =>
      prev.includes(chain)
        ? prev.length > 1
          ? prev.filter((c) => c !== chain)
          : prev
        : [...prev, chain]
    );
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">链上钱包</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            添加钱包
          </button>
        )}
      </div>

      {/* Wallet List */}
      {wallets.length > 0 && (
        <div className="space-y-3 mb-4">
          {wallets.map((wallet) => {
            const chains = getWalletChains(wallet);
            return (
              <div
                key={wallet.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{wallet.name}</span>
                    <div className="flex gap-1">
                      {chains.map((c) => (
                        <span
                          key={c}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium"
                        >
                          {CHAIN_LABELS[c]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {truncateAddress(wallet.address)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditWallet(wallet)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeWallet(wallet.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Wallet Form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{editingId ? '编辑钱包' : '添加新钱包'}</h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: 主钱包"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">钱包类型</label>
              <select
                value={walletType}
                onChange={(e) => {
                  const t = e.target.value as WalletType;
                  setWalletType(t);
                  if (t === 'evm') setSelectedEvmChains(['ethereum']);
                }}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="evm">EVM</option>
                <option value="solana">Solana</option>
                <option value="bitcoin">Bitcoin</option>
              </select>
            </div>
          </div>

          {/* EVM Chain Selection */}
          {walletType === 'evm' && (
            <div>
              <label className="text-sm font-medium mb-2 block">选择网络</label>
              <div className="flex flex-wrap gap-2">
                {EVM_CHAINS.map((chain) => {
                  const isSelected = selectedEvmChains.includes(chain.id);
                  return (
                    <button
                      key={chain.id}
                      onClick={() => toggleEvmChain(chain.id)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-accent'
                      }`}
                    >
                      {chain.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">钱包地址</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={walletType === 'evm' ? '0x...' : walletType === 'bitcoin' ? 'bc1... / 1... / 3...' : 'Solana 地址...'}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
            />
          </div>

          <button
            onClick={handleSubmitWallet}
            disabled={!name.trim() || !address.trim()}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {editingId ? '保存修改' : '确认添加'}
          </button>
        </div>
      )}
    </div>
  );
}
