'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { useCashBalanceStore } from '@/stores/cashBalanceStore';
import { cn } from '@/lib/utils';
import {
  BROKER_LABEL,
  type CashBalance,
  type StockBroker,
  type StockCurrency,
} from '@/types/stocks';

const BROKERS: StockBroker[] = ['ths', 'longport', 'ibkr'];
const CURRENCIES: StockCurrency[] = ['CNY', 'HKD', 'USD'];

const DEFAULT_CURRENCY: Record<StockBroker, StockCurrency> = {
  ths: 'CNY',
  longport: 'HKD',
  ibkr: 'USD',
};

interface CashBalancesManagerProps {
  embedded?: boolean;
  autoOpenForm?: boolean;
  initialBroker?: StockBroker;
}

export function CashBalancesManager({
  embedded,
  autoOpenForm,
  initialBroker,
}: CashBalancesManagerProps = {}) {
  const { balances, addBalance, removeBalance, updateBalance } =
    useCashBalanceStore();
  const [showForm, setShowForm] = useState(!!autoOpenForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [broker, setBroker] = useState<StockBroker>(initialBroker ?? 'ths');
  const [currency, setCurrency] = useState<StockCurrency>(
    DEFAULT_CURRENCY[initialBroker ?? 'ths']
  );
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (autoOpenForm) setShowForm(true);
  }, [autoOpenForm]);

  const resetForm = () => {
    setEditingId(null);
    setBroker(initialBroker ?? 'ths');
    setCurrency(DEFAULT_CURRENCY[initialBroker ?? 'ths']);
    setAmount('');
    setNote('');
    setShowForm(false);
  };

  const handleEdit = (b: CashBalance) => {
    setEditingId(b.id);
    setBroker(b.broker);
    setCurrency(b.currency);
    setAmount(String(b.amount));
    setNote(b.note ?? '');
    setShowForm(true);
  };

  const handleSubmit = () => {
    const num = parseFloat(amount);
    if (!Number.isFinite(num)) return;
    const payload: Omit<CashBalance, 'id'> = {
      broker,
      currency,
      amount: num,
      note: note.trim() || undefined,
    };
    if (editingId) {
      updateBalance(editingId, payload);
    } else {
      addBalance({ id: crypto.randomUUID(), ...payload });
    }
    resetForm();
  };

  const handleBrokerChange = (b: StockBroker) => {
    setBroker(b);
    if (!editingId) setCurrency(DEFAULT_CURRENCY[b]);
  };

  const grouped = BROKERS.map((b) => ({
    broker: b,
    items: balances.filter((x) => x.broker === b),
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
          {!embedded && <h2 className="font-semibold text-lg">券商现金</h2>}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              添加现金
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
              <p className="text-xs text-muted-foreground pl-1">暂无现金</p>
            ) : (
              <div className="space-y-2">
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                          {c.currency}
                        </span>
                        <span className="font-medium tabular-nums">
                          {c.amount.toLocaleString()}
                        </span>
                        {c.note && (
                          <span className="text-xs text-muted-foreground">
                            {c.note}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(c)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeBalance(c.id)}
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
              {editingId ? '编辑现金' : '添加现金'}
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
              <label className="text-sm font-medium">币种</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as StockCurrency)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">金额</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="例如 10000"
              step="any"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">备注 (可选)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如 港股通待结算"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!amount.trim()}
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
