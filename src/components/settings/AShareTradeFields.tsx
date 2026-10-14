'use client';

import type { LedgerAccount } from '@/types/ledger';

export function tradeDateTime(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface AShareTradeFieldsValue {
  occurredAt: string;
  commission: string;
  tax: string;
  otherFee: string;
  accountId: string;
}
export function AShareTradeFields({ value, onChange, accounts }: { value: AShareTradeFieldsValue; onChange: (value: AShareTradeFieldsValue) => void; accounts: LedgerAccount[] }) {
  const inputClass = 'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm';
  return <div className="space-y-3">
    <label className="block text-sm font-medium">成交时间<input type="datetime-local" value={value.occurredAt} onChange={(e) => onChange({ ...value, occurredAt: e.target.value })} className={inputClass} /></label>
    {accounts.length > 1 && <label className="block text-sm font-medium">账本账户<select value={value.accountId} onChange={(e) => onChange({ ...value, accountId: e.target.value })} className={inputClass}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
    <details><summary className="cursor-pointer text-xs text-muted-foreground">手续费／税费（可选，默认 0）</summary><div className="mt-2 grid gap-3 sm:grid-cols-3">{([['commission', '佣金'], ['tax', '税费'], ['otherFee', '其他费用']] as const).map(([key, label]) => <label className="block text-sm font-medium" key={key}>{label}（CNY）<input type="number" min="0" step="any" value={value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.value })} className={inputClass} /></label>)}</div></details>
    <p className="text-xs text-muted-foreground">确认后自动同步到{accounts.find((a) => a.id === value.accountId)?.name ?? 'A 股手工账户'}，费用同时从现金扣除。</p>
  </div>;
}
