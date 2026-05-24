'use client';

import { useRef, useState } from 'react';
import { Download, Plus, Upload, X } from 'lucide-react';
import {
  useTradeStore,
  type Trade,
  type TradeDirection,
  type TradeKind,
} from '@/stores/tradeStore';
import { useFx } from '@/hooks/useFx';
import { formatUsd } from '@/lib/format';

const CURRENCIES = ['USD', 'USDT', 'USDC', 'CNY', 'HKD', 'KRW', 'BTC', 'ETH'] as const;
const SOURCES = ['', 'Binance', 'OKX', 'Deribit', 'IBKR', '长桥', '同花顺'] as const;
const KIND_LABEL: Record<TradeKind, string> = {
  stock: '股票',
  option: '期权',
  crypto: '加密',
};

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

// Convert a (amount, currency) pair to USD using whatever FX we have.
// Crypto-denominated trades (BTC/ETH/...) can't be auto-converted without a
// live price feed in scope here, so the user enters the USD value manually.
function approxUsd(
  amount: number,
  currency: string,
  fx: { cnyUsd: number; hkdUsd: number; krwUsd: number } | null
): number | null {
  if (!Number.isFinite(amount)) return null;
  const c = currency.toUpperCase();
  if (c === 'USD' || c === 'USDT' || c === 'USDC') return amount;
  if (!fx) return null;
  if (c === 'CNY' && fx.cnyUsd > 0) return amount * fx.cnyUsd;
  if (c === 'HKD' && fx.hkdUsd > 0) return amount * fx.hkdUsd;
  if (c === 'KRW' && fx.krwUsd > 0) return amount * fx.krwUsd;
  return null;
}

export function TradeSettings() {
  const trades = useTradeStore((s) => s.trades);
  const addTrade = useTradeStore((s) => s.addTrade);
  const removeTrade = useTradeStore((s) => s.removeTrade);
  const importTrades = useTradeStore((s) => s.importTrades);
  const fxQuery = useFx();
  const fx = fxQuery.data ?? null;

  const [date, setDate] = useState(toDateInput(Date.now()));
  const [time, setTime] = useState(toTimeInput(Date.now()));
  const [symbol, setSymbol] = useState('');
  const [kind, setKind] = useState<TradeKind>('stock');
  const [direction, setDirection] = useState<TradeDirection>('buy');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<string>('USD');
  const [source, setSource] = useState<string>('');
  const [usdValueOverride, setUsdValueOverride] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const qtyNum = parseFloat(quantity);
  const priceNum = parseFloat(price);
  const notional = Number.isFinite(qtyNum) && Number.isFinite(priceNum)
    ? qtyNum * priceNum
    : null;
  const autoUsd = notional !== null ? approxUsd(notional, currency, fx) : null;
  const usdOverrideNum = parseFloat(usdValueOverride);
  const effectiveUsd =
    Number.isFinite(usdOverrideNum) && usdOverrideNum > 0
      ? usdOverrideNum
      : autoUsd;

  const canAdd =
    !!symbol.trim() &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    Number.isFinite(priceNum) &&
    priceNum > 0 &&
    effectiveUsd !== null &&
    effectiveUsd > 0;

  const needsManualUsd =
    autoUsd === null &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    Number.isFinite(priceNum) &&
    priceNum > 0;

  const handleAdd = () => {
    if (!canAdd || effectiveUsd === null) return;
    const ts = new Date(`${date}T${time}:00`).getTime();
    if (!Number.isFinite(ts)) return;
    addTrade({
      timestamp: ts,
      symbol: symbol.trim().toUpperCase(),
      kind,
      direction,
      quantity: qtyNum,
      price: priceNum,
      currency,
      usdValue: effectiveUsd,
      source: source || undefined,
    });
    setSymbol('');
    setQuantity('');
    setPrice('');
    setUsdValueOverride('');
  };

  const exportCsv = () => {
    if (trades.length === 0) return;
    const header =
      'id,timestamp,date,symbol,kind,direction,quantity,price,currency,usd_value,source';
    const rows = trades.map((t) =>
      [
        t.id,
        t.timestamp,
        new Date(t.timestamp).toISOString(),
        t.symbol,
        t.kind,
        t.direction,
        t.quantity,
        t.price,
        t.currency,
        t.usdValue,
        t.source ?? '',
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`;
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
      const parsed: Trade[] = [];
      for (const line of lines) {
        const cols = line.split(',');
        if (cols.length < 11) continue;
        const [id, tsStr, , sym, k, dir, qStr, pStr, ccy, uStr, src] = cols;
        const timestamp = Number(tsStr);
        const quantity = Number(qStr);
        const price = Number(pStr);
        const usdValue = Number(uStr);
        if (
          !Number.isFinite(timestamp) ||
          !Number.isFinite(quantity) ||
          !Number.isFinite(price) ||
          !Number.isFinite(usdValue)
        )
          continue;
        if (k !== 'stock' && k !== 'option' && k !== 'crypto') continue;
        if (dir !== 'buy' && dir !== 'sell') continue;
        parsed.push({
          id,
          timestamp,
          symbol: sym,
          kind: k,
          direction: dir,
          quantity,
          price,
          currency: ccy,
          usdValue,
          source: src || undefined,
        });
      }
      if (parsed.length > 0) importTrades(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold">交易记录</h2>
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
            disabled={trades.length === 0}
            title="导出 CSV"
            className="p-1.5 rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-30"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        记录买入/卖出操作。同一天的多笔交易在 portfolio 图表上合并成一个标记，
        颜色按当日净买卖方向决定。交易本身不改变组合总值，只作为时间线标注。
      </p>

      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[110px_100px_90px_minmax(100px,1fr)_minmax(100px,1fr)_100px_100px_auto]">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border bg-background px-2.5 py-2 text-sm"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-lg border bg-background px-2.5 py-2 text-sm"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as TradeDirection)}
          className="rounded-lg border bg-background px-2.5 py-2 text-sm"
        >
          <option value="buy">买入</option>
          <option value="sell">卖出</option>
        </select>
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="代码"
          className="rounded-lg border bg-background px-2.5 py-2 text-sm"
        />
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="数量"
          min={0}
          step="any"
          className="rounded-lg border bg-background px-2.5 py-2 text-sm"
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="价格"
          min={0}
          step="any"
          className="rounded-lg border bg-background px-2.5 py-2 text-sm"
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded-lg border bg-background px-2.5 py-2 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          添加
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[110px_minmax(120px,1fr)_minmax(140px,1fr)] text-xs">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as TradeKind)}
          className="rounded-lg border bg-background px-2.5 py-1.5"
        >
          {(Object.keys(KIND_LABEL) as TradeKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded-lg border bg-background px-2.5 py-1.5"
        >
          {SOURCES.map((s) => (
            <option key={s || 'none'} value={s}>
              {s || '来源（可选）'}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={usdValueOverride}
            onChange={(e) => setUsdValueOverride(e.target.value)}
            placeholder={
              needsManualUsd
                ? `USD 总值（必填，${currency} 无汇率）`
                : autoUsd !== null
                  ? `USD ${formatUsd(autoUsd)}（可覆盖）`
                  : 'USD 总值'
            }
            min={0}
            step="any"
            className="w-full rounded-lg border bg-background px-2.5 py-1.5"
          />
        </div>
      </div>

      {trades.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          暂无交易记录
        </p>
      ) : (
        <div className="space-y-1.5">
          {trades
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((t) => (
              <div
                key={t.id}
                className="group flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {new Date(t.timestamp).toLocaleString()}
                  </span>
                  <span
                    className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      t.direction === 'buy'
                        ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                        : 'bg-red-500/10 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {t.direction === 'buy' ? '买' : '卖'}
                  </span>
                  <span className="font-medium truncate">{t.symbol}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {t.quantity} × {t.price} {t.currency}
                  </span>
                  {t.source && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      · {t.source}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums">
                    {formatUsd(t.usdValue)}
                  </span>
                  <button
                    onClick={() => removeTrade(t.id)}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
