'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { truncateAddress } from '@/lib/format';
import type { Network, TrackedToken, WalletConfig } from '@/types/onchain';

const PRESET_TOKENS: Record<Network, TrackedToken[]> = {
  ethereum: [
    { symbol: 'ETH', contractAddress: '', decimals: 18, coingeckoId: 'ethereum' },
    { symbol: 'USDT', contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, coingeckoId: 'tether' },
    { symbol: 'USDC', contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'WBTC', contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, coingeckoId: 'wrapped-bitcoin' },
    { symbol: 'WETH', contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, coingeckoId: 'weth' },
  ],
  solana: [
    { symbol: 'SOL', contractAddress: '', decimals: 9, coingeckoId: 'solana' },
    { symbol: 'USDC', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, coingeckoId: 'usd-coin' },
    { symbol: 'USDT', contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, coingeckoId: 'tether' },
  ],
};

export function WalletManager() {
  const { wallets, addWallet, removeWallet } = useWalletStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState<Network>('ethereum');
  const [selectedTokens, setSelectedTokens] = useState<TrackedToken[]>([]);
  const [customSymbol, setCustomSymbol] = useState('');
  const [customContract, setCustomContract] = useState('');
  const [customDecimals, setCustomDecimals] = useState('18');

  const resetForm = () => {
    setName('');
    setAddress('');
    setNetwork('ethereum');
    setSelectedTokens([]);
    setCustomSymbol('');
    setCustomContract('');
    setCustomDecimals('18');
    setShowForm(false);
  };

  const handleAddWallet = () => {
    if (!name.trim() || !address.trim()) return;

    const wallet: WalletConfig = {
      id: crypto.randomUUID(),
      name: name.trim(),
      address: address.trim(),
      network,
      trackedTokens:
        selectedTokens.length > 0
          ? selectedTokens
          : [PRESET_TOKENS[network][0]],
    };

    addWallet(wallet);
    resetForm();
  };

  const handleAddCustomToken = () => {
    if (!customSymbol.trim()) return;
    const token: TrackedToken = {
      symbol: customSymbol.trim().toUpperCase(),
      contractAddress: customContract.trim(),
      decimals: parseInt(customDecimals) || 18,
    };
    setSelectedTokens([...selectedTokens, token]);
    setCustomSymbol('');
    setCustomContract('');
    setCustomDecimals('18');
  };

  const togglePresetToken = (token: TrackedToken) => {
    const exists = selectedTokens.some(
      (t) =>
        t.contractAddress === token.contractAddress &&
        t.symbol === token.symbol
    );
    if (exists) {
      setSelectedTokens(
        selectedTokens.filter(
          (t) =>
            !(
              t.contractAddress === token.contractAddress &&
              t.symbol === token.symbol
            )
        )
      );
    } else {
      setSelectedTokens([...selectedTokens, token]);
    }
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
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{wallet.name}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {wallet.network === 'ethereum' ? 'ETH' : 'SOL'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {truncateAddress(wallet.address)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  追踪: {wallet.trackedTokens.map((t) => t.symbol).join(', ')}
                </p>
              </div>
              <button
                onClick={() => removeWallet(wallet.id)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Wallet Form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">添加新钱包</h3>
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
              <label className="text-sm font-medium">网络</label>
              <select
                value={network}
                onChange={(e) => {
                  setNetwork(e.target.value as Network);
                  setSelectedTokens([]);
                }}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <option value="ethereum">Ethereum</option>
                <option value="solana">Solana</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">钱包地址</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={
                network === 'ethereum' ? '0x...' : 'Solana 地址...'
              }
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
            />
          </div>

          {/* Preset Tokens */}
          <div>
            <label className="text-sm font-medium mb-2 block">追踪代币</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_TOKENS[network].map((token) => {
                const isSelected = selectedTokens.some(
                  (t) =>
                    t.contractAddress === token.contractAddress &&
                    t.symbol === token.symbol
                );
                return (
                  <button
                    key={token.symbol + token.contractAddress}
                    onClick={() => togglePresetToken(token)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-accent'
                    }`}
                  >
                    {token.symbol}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Token */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              添加自定义代币
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
                placeholder="Symbol"
                className="w-24 rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={customContract}
                onChange={(e) => setCustomContract(e.target.value)}
                placeholder="合约地址"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm font-mono"
              />
              <input
                type="number"
                value={customDecimals}
                onChange={(e) => setCustomDecimals(e.target.value)}
                placeholder="Decimals"
                className="w-20 rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={handleAddCustomToken}
                className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                添加
              </button>
            </div>
          </div>

          {/* Selected Tokens Display */}
          {selectedTokens.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                已选代币: {selectedTokens.map((t) => t.symbol).join(', ')}
              </p>
            </div>
          )}

          <button
            onClick={handleAddWallet}
            disabled={!name.trim() || !address.trim()}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            确认添加
          </button>
        </div>
      )}
    </div>
  );
}
