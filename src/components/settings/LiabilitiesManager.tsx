'use client';

import { useState } from 'react';
import { useLiabilityStore } from '@/stores/liabilityStore';
import { usePrivacyFormat, PRIVACY_MASK } from '@/hooks/usePrivacyFormat';
import { formatCurrency } from '@/lib/format';
import type { Liability } from '@/lib/portfolio/liabilities';
import type { StockCurrency } from '@/types/stocks';

const inputClass = 'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm';

export function LiabilitiesManager() {
  const { liabilities, addLiability, updateLiability, removeLiability } = useLiabilityStore();
  const { hidden } = usePrivacyFormat();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<StockCurrency>('CNY');
  const [error, setError] = useState('');
  const reset = () => { setEditingId(null); setName(''); setAmount(''); setCurrency('CNY'); setError(''); };
  const edit = (row: Liability) => { setEditingId(row.id); setName(row.name); setAmount(String(row.amount)); setCurrency(row.currency); setError(''); };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!name.trim() || !amount.trim() || !Number.isFinite(num) || num < 0) { setError('请填写名称和大于或等于 0 的负债金额'); return; }
    const row = { name: name.trim(), amount: num, currency, broker: 'ths' as const };
    if (editingId) updateLiability(editingId, row);
    else addLiability({ id: crypto.randomUUID(), ...row });
    reset();
  };
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">A 股净资产 = 持仓市值 + 现金 − 负债。金额填写当前未偿余额，例如融资借款。</p>
    {liabilities.length > 0 && <div className="space-y-2">{liabilities.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><p className="text-sm font-medium">{row.name}</p><p className="text-sm tabular-nums text-muted-foreground">{hidden ? PRIVACY_MASK : formatCurrency(row.amount, row.currency)}</p></div><div className="flex gap-2"><button type="button" aria-label={`编辑负债 ${row.name}`} onClick={() => edit(row)} className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">编辑</button><button type="button" aria-label={`删除负债 ${row.name}`} onClick={() => { removeLiability(row.id); if (editingId === row.id) reset(); }} className="rounded-md border px-2 py-1 text-xs hover:bg-secondary">删除</button></div></div>)}</div>}
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm font-medium">负债名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 A 股融资借款" maxLength={100} className={inputClass} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium">负债金额<input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></label><label className="block text-sm font-medium">币种<select value={currency} onChange={(e) => setCurrency(e.target.value as StockCurrency)} className={inputClass}>{(['CNY', 'USD', 'HKD', 'KRW'] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">{editingId ? '保存修改' : '添加负债'}</button>{editingId && <button type="button" onClick={reset} className="rounded-lg border px-3 py-2 text-sm">取消编辑</button>}</div>
    </form>
  </div>;
}
