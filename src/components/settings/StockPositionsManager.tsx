'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, X, ArrowLeftRight } from 'lucide-react';
import { useStockPositionStore } from '@/stores/stockPositionStore';
import { useCashBalanceStore } from '@/stores/cashBalanceStore';
import { cn } from '@/lib/utils';
import {
  BROKER_LABEL,
  MARKET_CURRENCY,
  MARKET_LABEL,
  type StockBroker,
  type StockCurrency,
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

interface StockPositionsManagerProps {
  embedded?: boolean;
  autoOpenForm?: boolean;
  initialBroker?: StockBroker;
}

function PlaceholderForMarket(market: StockMarket): string {
  if (market === 'A') return '例如 600519';
  if (market === 'HK') return '例如 0700';
  return '例如 AAPL';
}

export function StockPositionsManager({
  embedded,
  autoOpenForm,
  initialBroker,
}: StockPositionsManagerProps = {}) {
  const { positions, addPosition, removePosition, updatePosition } =
    useStockPositionStore();
  const { balances, addBalance, updateBalance } = useCashBalanceStore();
  const [showForm, setShowForm] = useState(!!autoOpenForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [broker, setBroker] = useState<StockBroker>(initialBroker ?? 'ths');
  const [market, setMarket] = useState<StockMarket>(
    DEFAULT_MARKET[initialBroker ?? 'ths']
  );
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');

  const [tradingId, setTradingId] = useState<string | null>(null);
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [tradeShares, setTradeShares] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeError, setTradeError] = useState<string | null>(null);

  useEffect(() => {
    if (autoOpenForm) setShowForm(true);
  }, [autoOpenForm]);

  const resetForm = () => {
    setEditingId(null);
    setBroker(initialBroker ?? 'ths');
    setMarket(DEFAULT_MARKET[initialBroker ?? 'ths']);
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

  const startTrade = (id: string, action: 'buy' | 'sell') => {
    setTradingId(id);
    setTradeAction(action);
    setTradeShares('');
    setTradePrice('');
    setTradeError(null);
  };

  const cancelTrade = () => {
    setTradingId(null);
    setTradeShares('');
    setTradePrice('');
    setTradeError(null);
  };

  const adjustCash = (
    targetBroker: StockBroker,
    currency: StockCurrency,
    delta: number
  ) => {
    const existing = balances.find(
      (b) => b.broker === targetBroker && b.currency === currency
    );
    if (existing) {
      updateBalance(existing.id, { amount: existing.amount + delta });
    } else {
      addBalance({
        id: crypto.randomUUID(),
        broker: targetBroker,
        currency,
        amount: delta,
      });
    }
  };

  const handleTrade = (p: StockPosition) => {
    setTradeError(null);
    const sharesNum = parseFloat(tradeShares);
    const priceNum = parseFloat(tradePrice);
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) {
      setTradeError('数量需大于 0');
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setTradeError('价格需大于 0');
      return;
    }
    const mult = p.multiplier ?? 1;
    const cashDelta = sharesNum * priceNum * mult;
    const currency = MARKET_CURRENCY[p.market];

    if (tradeAction === 'buy') {
      const newShares = p.shares + sharesNum;
      // Weighted average cost basis. If the prior tranche had no cost recorded,
      // we don't fabricate one — keep it undefined so PnL stays "unknown".
      const newCost =
        p.costBasis !== undefined
          ? (p.costBasis * p.shares + priceNum * sharesNum) / newShares
          : undefined;
      updatePosition(p.id, { shares: newShares, costBasis: newCost });
      adjustCash(p.broker, currency, -cashDelta);
    } else {
      if (sharesNum > p.shares) {
        setTradeError(`持仓仅 ${p.shares} 股`);
        return;
      }
      const newShares = p.shares - sharesNum;
      if (newShares <= 0) {
        removePosition(p.id);
      } else {
        updatePosition(p.id, { shares: newShares });
      }
      adjustCash(p.broker, currency, +cashDelta);
    }
    cancelTrade();
  };

  const grouped = BROKERS.map((b) => ({
    broker: b,
    items: positions.filter((p) => p.broker === b),
  }));

  const content = (
    <>
      {(!embedded || !showForm) && (
        <div
          className={cn(
            'flex items-center mb-4',
            embedded ? 'justify-end' : 'justify-between'
          )}
        >
          {!embedded && <h2 className="font-semibold text-lg">股票持仓</h2>}
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
      )}

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
                    className="rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between">
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
                          onClick={() =>
                            tradingId === p.id
                              ? cancelTrade()
                              : startTrade(p.id, 'buy')
                          }
                          className={cn(
                            'rounded-md p-1.5 hover:bg-accent hover:text-foreground',
                            tradingId === p.id
                              ? 'text-foreground bg-accent'
                              : 'text-muted-foreground'
                          )}
                          title="买入 / 卖出"
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
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

                    {tradingId === p.id && (
                      <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setTradeAction('buy')}
                            className={cn(
                              'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                              tradeAction === 'buy'
                                ? 'bg-green-500/15 text-green-600'
                                : 'text-muted-foreground hover:bg-secondary'
                            )}
                          >
                            买入
                          </button>
                          <button
                            onClick={() => setTradeAction('sell')}
                            className={cn(
                              'flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                              tradeAction === 'sell'
                                ? 'bg-red-500/15 text-red-600'
                                : 'text-muted-foreground hover:bg-secondary'
                            )}
                          >
                            卖出
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            value={tradeShares}
                            onChange={(e) => setTradeShares(e.target.value)}
                            placeholder="数量"
                            min={0}
                            step="any"
                            className="rounded-md border bg-background px-2 py-1.5 text-sm"
                          />
                          <input
                            type="number"
                            value={tradePrice}
                            onChange={(e) => setTradePrice(e.target.value)}
                            placeholder={`价格 (${MARKET_CURRENCY[p.market]})`}
                            min={0}
                            step="any"
                            className="rounded-md border bg-background px-2 py-1.5 text-sm"
                          />
                        </div>
                        {tradeError && (
                          <p className="text-xs text-red-500">{tradeError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleTrade(p)}
                            disabled={!tradeShares.trim() || !tradePrice.trim()}
                            className="flex-1 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            确认{tradeAction === 'buy' ? '买入' : '卖出'}
                          </button>
                          <button
                            onClick={cancelTrade}
                            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
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
    </>
  );

  if (embedded) return content;
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">{content}</div>
  );
}
