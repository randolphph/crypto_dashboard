'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { useBankAccountStore, type BankAccount } from '@/stores/bankAccountStore';
import { cn } from '@/lib/utils';
import type { StockCurrency } from '@/types/stocks';

const CURRENCIES: StockCurrency[] = ['CNY', 'HKD', 'USD', 'KRW'];

interface Props {
  embedded?: boolean;
  autoOpenForm?: boolean;
}

export function BankAccountsManager({ embedded, autoOpenForm }: Props = {}) {
  const { accounts, addAccount, removeAccount, updateAccount } =
    useBankAccountStore();
  const [showForm, setShowForm] = useState(!!autoOpenForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bank, setBank] = useState('');
  const [currency, setCurrency] = useState<StockCurrency>('CNY');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (autoOpenForm) setShowForm(true);
  }, [autoOpenForm]);

  const resetForm = () => {
    setEditingId(null);
    setBank('');
    setCurrency('CNY');
    setAmount('');
    setNote('');
    setShowForm(false);
  };

  const handleEdit = (b: BankAccount) => {
    setEditingId(b.id);
    setBank(b.bank);
    setCurrency(b.currency);
    setAmount(String(b.amount));
    setNote(b.note ?? '');
    setShowForm(true);
  };

  const handleSubmit = () => {
    const num = parseFloat(amount);
    if (!Number.isFinite(num) || !bank.trim()) return;
    const payload: Omit<BankAccount, 'id'> = {
      bank: bank.trim(),
      currency,
      amount: num,
      note: note.trim() || undefined,
    };
    if (editingId) {
      updateAccount(editingId, payload);
    } else {
      addAccount({ id: crypto.randomUUID(), ...payload });
    }
    resetForm();
  };

  // Group by bank name so the same institution's multi-currency accounts
  // cluster together — typical for users holding e.g. HKD + USD at HSBC.
  const grouped = new Map<string, BankAccount[]>();
  for (const a of accounts) {
    if (!grouped.has(a.bank)) grouped.set(a.bank, []);
    grouped.get(a.bank)!.push(a);
  }

  const content = (
    <>
      {(!embedded || !showForm) && (
        <div
          className={cn(
            'flex items-center mb-4',
            embedded ? 'justify-end' : 'justify-between'
          )}
        >
          {!embedded && <h2 className="font-semibold text-lg">银行账户</h2>}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              添加账户
            </button>
          )}
        </div>
      )}

      <div className="space-y-4 mb-4">
        {grouped.size === 0 ? (
          <p className="text-xs text-muted-foreground pl-1">暂无银行账户</p>
        ) : (
          Array.from(grouped.entries()).map(([bankName, items]) => (
            <div key={bankName}>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                {bankName}
                <span className="ml-2 text-xs">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(c)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeAccount(c.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {editingId ? '编辑银行账户' : '添加银行账户'}
            </h3>
            <button
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="text-sm font-medium">银行 / 账户名</label>
            <input
              type="text"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="例如 招商银行、汇丰、支付宝"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
            <div>
              <label className="text-sm font-medium">金额</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例如 50000"
                step="any"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">备注 (可选)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如 工资卡、外币储蓄"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={!amount.trim() || !bank.trim()}
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
