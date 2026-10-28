'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useLedgerStore } from '@/stores/ledgerStore';
import { saveAShareTrade, recoverAShareTrade } from '@/lib/stocks/saveManualTrade';
import { AShareTradeFields, tradeDateTime, type AShareTradeFieldsValue } from './AShareTradeFields';
import { Plus, Trash2, Pencil, X, ArrowLeftRight } from 'lucide-react';
import { useStockPositionStore } from '@/stores/stockPositionStore';
import { useCashBalanceStore } from '@/stores/cashBalanceStore';
import { useCashToastStore } from '@/stores/cashToastStore';
import { useAShareName } from '@/hooks/useAShareName';
import { cn } from '@/lib/utils';
import {
  BROKER_LABEL,
  MARKET_CURRENCY,
  MARKET_LABEL,
  type StockBroker,
  type StockCurrency,
  type StockMarket,
  type StockPosition,
  type EnrichedPosition,
} from '@/types/stocks';

const BROKERS: StockBroker[] = ['ths', 'longport', 'ibkr'];
const MARKETS: StockMarket[] = ['A', 'HK', 'US', 'KR'];

const DEFAULT_MARKET: Record<StockBroker, StockMarket> = {
  ths: 'A',
  longport: 'HK',
  ibkr: 'US',
};

interface StockPositionsManagerProps {
  embedded?: boolean;
  autoOpenForm?: boolean;
  initialBroker?: StockBroker;
  livePositions?: EnrichedPosition[];
}

const EMPTY_LIVE_POSITIONS: EnrichedPosition[] = [];
const nameKey = (market: StockMarket, symbol: string) => `${market}:${symbol.trim().toUpperCase()}`;

function PlaceholderForMarket(market: StockMarket): string {
  if (market === 'A') return '例如 600519';
  if (market === 'HK') return '例如 0700';
  if (market === 'KR') return '例如 005930';
  return '例如 AAPL';
}

export function StockPositionsManager({
  embedded,
  autoOpenForm,
  initialBroker,
  livePositions = EMPTY_LIVE_POSITIONS,
}: StockPositionsManagerProps = {}) {
  const { positions, addPosition, removePosition, updatePosition } =
    useStockPositionStore();
  const { balances, addBalance, updateBalance } = useCashBalanceStore();
  const pushCashToast = useCashToastStore((s) => s.push);
  const [showForm, setShowForm] = useState(!!autoOpenForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [broker, setBroker] = useState<StockBroker>(initialBroker ?? 'ths');
  const [market, setMarket] = useState<StockMarket>(
    DEFAULT_MARKET[initialBroker ?? 'ths']
  );
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [entryMode, setEntryMode] = useState<'buy' | 'opening'>('buy');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [syncedAccountId, setSyncedAccountId] = useState('');
  const accounts = useLedgerStore((s) => s.accounts);
  const aShareAccounts = accounts.filter((a) => a.platform === 'ths' && a.enabled && a.syncMode === 'manual');
  const defaultAccountId = aShareAccounts.find((a) => a.id === 'account-a-share-manual')?.id ?? aShareAccounts[0]?.id ?? '';
  const [tradeFields, setTradeFields] = useState<AShareTradeFieldsValue>(() => ({ occurredAt: tradeDateTime(), commission: '', tax: '', otherFee: '', accountId: '' }));
  const transactionId = useRef<string | null>(null);
  const isAShare = broker === 'ths' && market === 'A';
  const resetTradeFields = (accountId = defaultAccountId) => {
    setTradeFields({ occurredAt: tradeDateTime(), commission: '', tax: '', otherFee: '', accountId });
    transactionId.current = null;
  };
  useEffect(() => {
    try {
      const recovered = recoverAShareTrade();
      if (recovered) { setSavedMessage('上次交易已恢复并同步到账本'); setSyncedAccountId(recovered.activity.accountId); setSynced(true); }
    } catch { setFormError('上次交易尚未保存完整，请重试或刷新以恢复'); }
  }, []);
  const recordAShare = (side: 'buy' | 'sell', quantity: number, price: number, p?: StockPosition) => {
    transactionId.current ??= crypto.randomUUID();
    const accountId = tradeFields.accountId || p?.ledgerAccountId || defaultAccountId;
    const result = saveAShareTrade({ transactionId: transactionId.current, accountId, positionId: p?.id, symbol: p?.symbol ?? symbol, name: p ? positionName(p) : formName, side, quantity, price, occurredAt: new Date(tradeFields.occurredAt).getTime(), commission: Number(tradeFields.commission || 0), tax: Number(tradeFields.tax || 0), otherFee: Number(tradeFields.otherFee || 0) });
    if (result.recorded && result.plan) pushCashToast({ broker: 'ths', currency: 'CNY', delta: result.plan.cashDelta, reason: `${side === 'buy' ? '买入' : '卖出'} ${p?.symbol ?? symbol}` });
    setSavedMessage('交易已保存并同步到账本'); setSyncedAccountId(accountId); setSynced(true);
  };

  const [tradingId, setTradingId] = useState<string | null>(null);
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [tradeShares, setTradeShares] = useState('');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeError, setTradeError] = useState<string | null>(null);
  const knownNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of livePositions) {
      const value = p.name?.trim() || p.quoteName?.trim();
      if (value) names.set(nameKey(p.market, p.symbol), value);
    }
    for (const p of positions) if (p.name?.trim()) names.set(nameKey(p.market, p.symbol), p.name.trim());
    return names;
  }, [livePositions, positions]);
  const tradingPosition = positions.find(p => p.id === tradingId);
  const lookupSymbol = showForm ? symbol : tradingPosition?.symbol ?? '';
  const lookupMarket = showForm ? market : tradingPosition?.market;
  const lookup = useAShareName(lookupSymbol, lookupMarket === 'A' && (showForm || !!tradingPosition), lookupMarket ? knownNames.get(nameKey(lookupMarket, lookupSymbol)) : undefined);
  const formName = name ?? knownNames.get(nameKey(market, symbol)) ?? (market === 'A' ? lookup.name : '');
  const positionName = (p: StockPosition) => knownNames.get(nameKey(p.market, p.symbol)) || (tradingId === p.id ? lookup.name : '') || undefined;

  useEffect(() => {
    if (autoOpenForm) setShowForm(true);
  }, [autoOpenForm]);

  const resetForm = () => {
    setEditingId(null);
    setBroker(initialBroker ?? 'ths');
    setMarket(DEFAULT_MARKET[initialBroker ?? 'ths']);
    setSymbol('');
    setName(null);
    setShares('');
    setCostBasis('');
    setShowForm(false);
    setEntryMode('buy'); setFormError(null);
  };

  const handleEdit = (p: StockPosition) => {
    setEditingId(p.id);
    setBroker(p.broker);
    setMarket(p.market);
    setSymbol(p.symbol);
    setName(p.name?.trim() || null);
    setShares(String(p.shares));
    setCostBasis(p.costBasis !== undefined ? String(p.costBasis) : '');
    setShowForm(true);
    setFormError(null); setTradingId(null);
  };

  const handleSubmit = () => {
    setFormError(null);
    const sharesNum = parseFloat(shares);
    if (!symbol.trim() || !Number.isFinite(sharesNum) || sharesNum <= 0) return;
    const costNum = costBasis.trim() === '' ? undefined : parseFloat(costBasis);
    if (costNum !== undefined && !Number.isFinite(costNum)) return;

    const payload: Omit<StockPosition, 'id'> = {
      broker,
      market,
      symbol: symbol.trim(),
      name: formName.trim() || undefined,
      shares: sharesNum,
      costBasis: costNum,
    };

    if (isAShare) {
      try {
        if (!Number.isInteger(sharesNum) || sharesNum <= 0) throw new Error('数量需为正整数');
        if (editingId || entryMode === 'opening') {
          if (costNum !== undefined && costNum < 0) throw new Error('成本价不能为负数');
          if (editingId) updatePosition(editingId, payload);
          else addPosition({ id: crypto.randomUUID(), ...payload, ledgerAccountId: tradeFields.accountId || defaultAccountId || undefined });
          setSavedMessage('持仓记录已保存，现金和交易账本未调整'); setSynced(false);
        } else {
          if (costNum === undefined || costNum <= 0) throw new Error('新增买入需填写成交价格');
          recordAShare('buy', sharesNum, costNum);
        }
        resetForm();
      } catch (error) { setFormError(error instanceof Error ? error.message : '保存失败，请重试'); }
      return;
    }

    if (editingId) {
      const old = positions.find((p) => p.id === editingId);
      updatePosition(editingId, payload);
      if (old) {
        // Treat edit as "reverse the original buy, then apply the new one" so
        // share/cost corrections net out and broker/market changes move cash
        // between currencies cleanly.
        const oldImpact = positionCashImpact(old);
        const newImpact = positionCashImpact(payload);
        const sameSlot =
          old.broker === payload.broker && old.market === payload.market;
        if (sameSlot) {
          adjustCash(
            payload.broker,
            MARKET_CURRENCY[payload.market],
            oldImpact - newImpact,
            `修改 ${payload.symbol}`
          );
        } else {
          adjustCash(
            old.broker,
            MARKET_CURRENCY[old.market],
            +oldImpact,
            `迁出 ${old.symbol}`
          );
          adjustCash(
            payload.broker,
            MARKET_CURRENCY[payload.market],
            -newImpact,
            `迁入 ${payload.symbol}`
          );
        }
      }
    } else {
      addPosition({ id: crypto.randomUUID(), ...payload });
      adjustCash(
        payload.broker,
        MARKET_CURRENCY[payload.market],
        -positionCashImpact(payload),
        `买入 ${payload.symbol}`
      );
    }
    resetForm();
  };

  const handleBrokerChange = (b: StockBroker) => {
    setBroker(b);
    // Only auto-switch market when adding (not editing), to keep edits sticky.
    if (!editingId) {
      if (market !== DEFAULT_MARKET[b]) setName(null);
      setMarket(DEFAULT_MARKET[b]);
    }
  };

  const startTrade = (id: string, action: 'buy' | 'sell') => {
    setTradingId(id);
    setTradeAction(action);
    setTradeShares('');
    setTradePrice('');
    setTradeError(null);
    setShowForm(false); setSavedMessage(null);
    resetTradeFields(positions.find((p) => p.id === id)?.ledgerAccountId ?? defaultAccountId);
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
    delta: number,
    reason?: string
  ) => {
    if (delta === 0) return;
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
    pushCashToast({ broker: targetBroker, currency, delta, reason });
  };

  const positionCashImpact = (p: {
    shares: number;
    costBasis?: number;
    multiplier?: number;
  }): number => {
    if (p.costBasis === undefined) return 0;
    return p.shares * p.costBasis * (p.multiplier ?? 1);
  };

  const handleDelete = (p: StockPosition) => {
    removePosition(p.id);
    if (p.broker === 'ths' && p.market === 'A') { setSavedMessage('持仓记录已移除，现金和交易账本未调整'); setSynced(false); return; }
    adjustCash(
      p.broker,
      MARKET_CURRENCY[p.market],
      +positionCashImpact(p),
      `清仓 ${p.symbol}`
    );
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
    if (p.broker === 'ths' && p.market === 'A') {
      try { recordAShare(tradeAction, sharesNum, priceNum, p); cancelTrade(); }
      catch (error) { setTradeError(error instanceof Error ? error.message : '保存失败，请重试'); }
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
      adjustCash(
        p.broker,
        currency,
        -cashDelta,
        `买入 ${p.symbol} ${sharesNum} 股`
      );
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
      adjustCash(
        p.broker,
        currency,
        +cashDelta,
        `卖出 ${p.symbol} ${sharesNum} 股`
      );
    }
    cancelTrade();
  };

  const grouped = BROKERS.map((b) => ({
    broker: b,
    items: positions.filter((p) => p.broker === b),
  }));

  const content = (
    <>
      {savedMessage && <p role="status" className="mb-3 text-sm text-muted-foreground">{savedMessage}{synced && <Link href={`/transactions?view=activities&account=${encodeURIComponent(syncedAccountId)}`} className="ml-2 text-primary underline">查看交易账本</Link>}</p>}
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
              onClick={() => { setShowForm(true); setTradingId(null); setFormError(null); setSavedMessage(null); resetTradeFields(); }}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.symbol}</span>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                            {MARKET_LABEL[p.market]}
                          </span>
                          {positionName(p) && (
                            <span className="text-xs text-muted-foreground">
                              {positionName(p)}
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
                          aria-label={`买入 / 卖出 ${p.symbol}`}
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(p)}
                          aria-label={`编辑持仓 ${p.symbol}`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          aria-label={`删除持仓 ${p.symbol}`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {tradingId === p.id && (
                      <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
                        <p className="text-sm font-medium" aria-live="polite">{tradeAction === 'buy' ? '买入' : '卖出'} · {positionName(p) ? `${positionName(p)}（${p.symbol}）` : p.symbol}</p>
                        {p.market === 'A' && lookup.loading && <p role="status" className="text-xs text-muted-foreground">正在查询股票名称…</p>}
                        {p.market === 'A' && lookup.unavailable && <p className="text-xs text-muted-foreground">暂未查到名称，可在编辑持仓中手动填写。</p>}
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
                        {p.broker === 'ths' && p.market === 'A' && <AShareTradeFields value={{ ...tradeFields, accountId: tradeFields.accountId || p.ledgerAccountId || defaultAccountId }} onChange={setTradeFields} accounts={aShareAccounts} />}
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

          {isAShare && !editingId && <label className="block text-sm font-medium">录入方式<select value={entryMode} onChange={(e) => setEntryMode(e.target.value as 'buy' | 'opening')} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"><option value="buy">新增买入（同步账本）</option><option value="opening">录入已有持仓</option></select></label>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="stock-position-broker" className="text-sm font-medium">券商</label>
              <select
                id="stock-position-broker"
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
              <label htmlFor="stock-position-market" className="text-sm font-medium">市场</label>
              <select
                id="stock-position-market"
                value={market}
                onChange={(e) => { setMarket(e.target.value as StockMarket); setName(null); }}
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
              <label htmlFor="stock-position-symbol" className="text-sm font-medium">代码</label>
              <input
                id="stock-position-symbol"
                type="text"
                value={symbol}
                onChange={(e) => { setSymbol(e.target.value); setName(null); }}
                placeholder={PlaceholderForMarket(market)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono"
              />
              {market === 'A' && <p role="status" aria-live="polite" className="mt-1 text-xs text-muted-foreground">
                {lookup.name ? `股票名称：${lookup.name}` : lookup.loading ? '正在查询股票名称…' : lookup.unavailable ? '暂未查到名称，可手动填写。' : '输入完整 A 股代码后显示名称'}
              </p>}
            </div>
            <div>
              <label htmlFor="stock-position-name" className="text-sm font-medium">名称 (可选)</label>
              <input
                id="stock-position-name"
                type="text"
                value={formName}
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
                {isAShare && !editingId && entryMode === 'buy' ? '成交价' : '成本价'} (每股，{MARKET_CURRENCY[market]})
              </label>
              <input
                type="number"
                value={costBasis}
                onChange={(e) => setCostBasis(e.target.value)}
                placeholder={isAShare && !editingId && entryMode === 'buy' ? '必填，用于记录成交' : '可选，用于计算盈亏'}
                step="any"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          {isAShare && !editingId && entryMode === 'buy' && <AShareTradeFields value={{ ...tradeFields, accountId: tradeFields.accountId || defaultAccountId }} onChange={setTradeFields} accounts={aShareAccounts} />}
          {isAShare && (editingId || entryMode === 'opening') && <p className="text-xs text-muted-foreground">仅维护当前持仓，不调整现金，不生成成交记录。</p>}
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}

          <button
            onClick={handleSubmit}
            disabled={!symbol.trim() || !shares.trim()}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {editingId ? '保存修改' : isAShare && entryMode === 'buy' ? '确认买入并同步账本' : '确认添加'}
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
