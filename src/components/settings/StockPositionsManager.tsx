'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { useStockPositionStore } from '@/stores/stockPositionStore';
import {
  BROKER_LABEL,
  MARKET_LABEL,
  type StockBroker,
  type StockMarket,
  type StockPosition,
} from '@/types/stocks';

const BROKERS: StockBroker[] = ['ths', 'longport', 'ibkr'];
const MARKETS: StockMarket[] = ['A', 'HK', 'US'];

const DEFAULT_MARKET: Record<StockBroker, StockMarket> = {
  ths: 'A',
  longport: 'HK',
  ibkr: 'US',
};

function PlaceholderForMarket(market: StockMarket): string {
  if (market === 'A') return '例如 600519';
  if (market === 'HK') return '例如 0700';
  return '例如 AAPL';
}

export function StockPositionsManager() {
  const { positions, addPosition, removePosition, updatePosition } =
    useStockPositionStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [broker, setBroker] = useState<StockBroker>('ths');
  const [market, setMarket] = useState<StockMarket>('A');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setBroker('ths');
    setMarket('A');
    setSymbol('');
    setName('');
    setShares('');
    setCostBasis('');
    setShowForm(false);
  };

  const handleEdit = (p: StockPosition) => {
    setEditingId(p.id);
    setBroker(p.broker);
    setMarket(p.market);
    setSymbol(p.symbol);
    setName(p.name ?? '');
    setShares(String(p.shares));
    setCostBasis(p.costBasis !== undefined ? String(p.costBasis) : '');
    setShowForm(true);
  };

  const handleSubmit = () => {
    const sharesNum = parseFloat(shares);
    if (!symbol.trim() || !Number.isFinite(sharesNum) || sharesNum <= 0) return;
    const costNum = costBasis.trim() === '' ? undefined : parseFloat(costBasis);
    if (costNum !== undefined && !Number.isFinite(costNum)) return;

    const payload: Omit<StockPosition, 'id'> = {
      broker,
      market,
      symbol: symbol.trim(),
      name: name.trim() || undefined,
      shares: sharesNum,
      costBasis: costNum,
    };

    if (editingId) {
      updatePosition(editingId, payload);
    } else {
      addPosition({ id: crypto.randomUUID(), ...payload });
    }
    resetForm();
  };

  const handleBrokerChange = (b: StockBroker) => {
    setBroker(b);
    // Only auto-switch market when adding (not editing), to keep edits sticky.
    if (!editingId) setMarket(DEFAULT_MARKET[b]);
  };

  const grouped = BROKERS.map((b) => ({
    broker: b,
    items: positions.filter((p) => p.broker === b),
  }));

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-lg">股票持仓</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            添加持仓
          </button>
        )}
      </div>

      <div className="space-y-4 mb-4">
        {grouped.map((g) => (
          <div key={g.broker}>
            <div className="text-sm font-medium text-muted-foreground mb-2">
              {BROKER_LABEL[g.broker]}
              <span className="ml-2 text-xs">({g.items.length})</span>
            </div>
            {g.items.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-1">暂无持仓</p>
            ) : (
              <div className="space-y-2">
                {g.items.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.symbol}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                          {MARKET_LABEL[p.market]}
                        </span>
                        {p.name && (
                          <span className="text-xs text-muted-foreground">
                            {p.name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.shares.toLocaleString()} 股
                        {p.costBasis !== undefined &&
                          ` · 成本 ${p.costBasis}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(p)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removePosition(p.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {editingId ? '编辑持仓' : '添加新持仓'}
            </h3>
            <button
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">券商</label>
              <select
                value={broker}
                onChange={(e) => handleBrokerChange(e.target.value as StockBroker)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {BROKERS.map((b) => (
                  <option key={b} value={b}>
                    {BROKER_LABEL[b]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">市场</label>
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value as StockMarket)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {MARKETS.map((m) => (
                  <option key={m} value={m}>
                    {MARKET_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">代码</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder={PlaceholderForMarket(market)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-sm font-medium">名称 (可选)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="留空则用行情返回的名称"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">数量 (股)</label>
              <input
                type="number"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="例如 100"
                step="any"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                成本价 (每股，{market === 'A' ? 'CNY' : market === 'HK' ? 'HKD' : 'USD'})
              </label>
              <input
                type="number"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
                placeholder="可选，用于计算盈亏"
                step="any"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!symbol.trim() || !shares.trim()}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {editingId ? '保存修改' : '确认添加'}
          </button>
        </div>
      )}
    </div>
  );
}
