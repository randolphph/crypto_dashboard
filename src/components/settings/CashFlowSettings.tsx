'use client';

import { useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Download, Plus, Upload, X } from 'lucide-react';
import { useCashFlowStore, type CashFlowEvent, type CashFlowType } from '@/stores/cashFlowStore';
import { formatUsd } from '@/lib/format';

function toDateInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CashFlowSettings() {
  const events = useCashFlowStore((s) => s.events);
  const addEvent = useCashFlowStore((s) => s.addEvent);
  const removeEvent = useCashFlowStore((s) => s.removeEvent);
  const importEvents = useCashFlowStore((s) => s.importEvents);

  const [type, setType] = useState<CashFlowType>('withdraw');
  const [date, setDate] = useState(toDateInput(Date.now()));
  const [time, setTime] = useState(toTimeInput(Date.now()));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const ts = new Date(`${date}T${time}:00`).getTime();
    if (!Number.isFinite(ts)) return;
    addEvent({ timestamp: ts, type, amount: amt, note: note.trim() || undefined });
    setAmount('');
    setNote('');
  };

  const exportCsv = () => {
    if (events.length === 0) return;
    const header = 'id,timestamp,date,type,amount,note';
    const rows = events.map((e) =>
      [
        e.id,
        e.timestamp,
        new Date(e.timestamp).toISOString(),
        e.type,
        e.amount,
        e.note ? `"${e.note.replace(/"/g, '""')}"` : '',
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-flow-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.trim().split('\n').slice(1);
      const parsed: CashFlowEvent[] = [];
      for (const line of lines) {
        // crude CSV split (note may have commas inside quotes)
        const match = line.match(/^([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.*)$/);
        if (!match) continue;
        const [, id, ts, , type, amt, noteRaw] = match;
        const timestamp = Number(ts);
        const amount = Number(amt);
        if (!Number.isFinite(timestamp) || !Number.isFinite(amount)) continue;
        if (type !== 'deposit' && type !== 'withdraw') continue;
        const note = noteRaw.startsWith('"') ? noteRaw.slice(1, -1).replace(/""/g, '"') : noteRaw || undefined;
        parsed.push({ id, timestamp, type, amount, note });
      }
      if (parsed.length > 0) importEvents(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold">现金流事件</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="导入 CSV"
            className="p-1.5 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Upload className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCsv}
          />
          <button
            onClick={exportCsv}
            disabled={events.length === 0}
            title="导出 CSV"
            className="p-1.5 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-30"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        记录从外部转入或转出加密资产的事件。图表会在对应时间点标注竖线，
        并把「区间涨跌」拆分为原始变化和扣除净流入/流出的真实盈亏。
      </p>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[100px_140px_110px_130px_1fr_auto]">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CashFlowType)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        >
          <option value="withdraw">提现</option>
          <option value="deposit">充值</option>
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="金额 (USD)"
          min={0}
          step="any"
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注（可选）"
          maxLength={64}
          className="rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={!amount || Number(amount) <= 0}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          添加
        </button>
      </div>

      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          暂无记录
        </p>
      ) : (
        <div className="space-y-2">
          {events
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {e.type === 'withdraw' ? (
                    <ArrowUpFromLine className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <ArrowDownToLine className="h-4 w-4 text-green-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-medium">
                        {e.type === 'withdraw' ? '提现' : '充值'} {formatUsd(e.amount)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.timestamp).toLocaleString([], {
                          year: 'numeric',
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {e.note && (
                      <p className="text-xs text-muted-foreground truncate">{e.note}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeEvent(e.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="删除"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        共 {events.length} 条
      </p>
    </div>
  );
}
