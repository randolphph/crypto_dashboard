'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { useGoldStore } from '@/stores/goldStore';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { formatCurrency } from '@/lib/format';
import { validateGoldHolding, valueGoldHoldings } from '@/lib/portfolio/gold';
import { goldCategoryKey, GOLD_CATEGORY_ID } from '@/lib/portfolio/assetCategories';
import { AssetCategorySelect } from './AssetCategorySelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { GoldHolding, GoldQuote } from '@/types/gold';
import type { FxRates, StockCurrency } from '@/types/stocks';

function GoldForm({ initial, onSave, onCancel }: { initial?: GoldHolding; onSave: (holding: GoldHolding) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? '黄金');
  const [grams, setGrams] = useState(initial ? String(initial.grams) : '');
  const [price, setPrice] = useState(initial ? String(initial.buyPricePerGram) : '');
  const [currency, setCurrency] = useState<StockCurrency>(initial?.currency ?? 'CNY');
  const [error, setError] = useState('');
  const draft = { id: initial?.id ?? '', name, grams: grams.trim() ? Number(grams) : NaN, buyPricePerGram: price.trim() ? Number(price) : NaN, currency };
  const preview = valueGoldHoldings([draft]).items[0].costLocal;
  const inputClass = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm';
  return <form noValidate className="space-y-4" onSubmit={event => {
    event.preventDefault(); setError('');
    try { onSave(validateGoldHolding({ ...draft, id: initial?.id ?? crypto.randomUUID() })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); }
  }}>
    <label className="block text-sm">名称<input value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="例如金条、金饰" /></label>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">克数 (g)<input autoFocus type="number" min="0" step="any" inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} className={inputClass} placeholder="例如 10.5" /></label>
      <label className="block text-sm">每克买入价 ({currency}/g)<input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} className={inputClass} placeholder="例如 600" /></label>
    </div>
    <label className="block text-sm">价格币种<select aria-label="价格币种" value={currency} onChange={e => setCurrency(e.target.value as StockCurrency)} className={inputClass}>
      <option value="CNY">CNY · 人民币</option><option value="USD">USD · 美元</option><option value="HKD">HKD · 港币</option><option value="KRW">KRW · 韩元</option>
    </select></label>
    <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">买入总额 <span className="font-semibold tabular-nums">{Number.isFinite(preview) ? formatCurrency(preview, currency) : '—'}</span></div>
    <p className="text-xs text-muted-foreground">买入总额用于记录成本；持仓市值按国内现货大盘金价（上金所 Au99.99）计算。</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-md border px-3 py-2 text-sm">取消</button><button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">保存黄金</button></div>
  </form>;
}

function IngotOutline({ x, y, stamped = false }: { x: number; y: number; stamped?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 0 26 17v12L0 12Z" className="fill-[#f7f2e4] dark:fill-[#252219]" />
      <path d="m26 17 130-20V9L26 29Z" className="fill-[#f4eedf] dark:fill-[#222017]" />
      <path d="m0 0 130-20 26 17L26 17Z" className="fill-[#fdfbf5] dark:fill-[#1c1b17]" />
      {stamped && <text x="78" y="3" transform="rotate(-8.75 78 0)" textAnchor="middle" fontSize="10" letterSpacing="1" stroke="none" fill="currentColor">Au</text>}
    </g>
  );
}

function GoldBar({ weight }: { weight: string }) {
  return (
    <svg role="img" aria-label={`黄金持有量 ${weight} g`} viewBox="0 0 220 148" className="mt-1 h-auto w-full max-w-[200px] text-stone-500 dark:text-stone-400">
      <IngotOutline x={14} y={57} />
      <IngotOutline x={40} y={74} />
      <IngotOutline x={29} y={37} stamped />
      <text x="110" y="137" textAnchor="middle" fontSize="22" fontWeight="500" className="fill-foreground tabular-nums">{weight}<tspan dx="4" fontSize="12" fontWeight="400">g</tspan></text>
    </svg>
  );
}

export function GoldSection({ fx, quote, quoteError, quoteLoading }: { fx?: FxRates; quote?: GoldQuote; quoteError?: string; quoteLoading?: boolean }) {
  const { holdings, addHolding, updateHolding, removeHolding } = useGoldStore();
  const { fmtUsd, hidden } = usePrivacyFormat();
  const valuation = valueGoldHoldings(holdings, fx, quote);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GoldHolding | undefined>();
  const native = (value: number, currency: StockCurrency) => hidden ? '******' : Number.isFinite(value) ? formatCurrency(value, currency) : '—';
  const grams = (value: number) => hidden ? '******' : Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 8 }) : '—';
  const displayCurrency = 'CNY';
  const displayAmount = (value: number | null) => value === null ? '—' : native(value, 'CNY');
  const priceLocal = valuation.priceCnyPerGram;
  const stale = valuation.priceStatus === 'stale' || !!quoteError;
  const profitColor = valuation.pnlCny === null ? '' : valuation.pnlCny >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const records = valuation.items.map(h => (
    <div key={h.id} data-gold-id={h.id} className="space-y-3 border-t py-3 first:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="break-all text-sm font-medium">{h.name}</span>
          <AssetCategorySelect assetId={goldCategoryKey(h.id)} label={h.name} defaultCategoryId={GOLD_CATEGORY_ID} />
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label={`编辑黄金 ${h.name}`} onClick={() => { setEditing(h); setOpen(true); }} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil className="h-4 w-4" /></button>
          <button type="button" aria-label={`删除黄金 ${h.name}`} onClick={() => removeHolding(h.id)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      <dl className={`grid gap-x-5 gap-y-4 ${holdings.length > 1 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
        {holdings.length > 1 && <div><dt className="text-xs text-muted-foreground">克数</dt><dd className="mt-1 break-all text-sm tabular-nums">{grams(h.grams)} g</dd></div>}
        <div><dt className="text-xs text-muted-foreground">每克买入价</dt><dd className="mt-1 break-all text-sm tabular-nums">{native(h.buyPricePerGram, h.currency)}<span className="text-xs text-muted-foreground"> /g</span></dd></div>
        <div><dt className="text-xs text-muted-foreground">买入总额 · {h.currency}</dt><dd className="mt-1 break-all text-sm tabular-nums">{native(h.costLocal, h.currency)}</dd></div>
        {holdings.length > 1 && <div><dt className="text-xs text-muted-foreground">参考市值 · USD</dt><dd data-gold-field="value-usd" className="mt-1 break-all text-sm tabular-nums">{h.valueUsd === null ? '—' : fmtUsd(h.valueUsd)}</dd></div>}
      </dl>
    </div>
  ));

  return (
    <section aria-label="黄金资产" className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold">黄金</h2>
        </div>
        <button type="button" onClick={() => { setEditing(undefined); setOpen(true); }} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"><Plus className="h-3.5 w-3.5" />添加黄金</button>
      </div>
      <div className="mx-5 mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
        <span className="text-muted-foreground">国内现货 · Au99.99 · 元/克</span>
        <span data-gold-field="spot-price" className="font-medium tabular-nums">{priceLocal === null ? '—' : formatCurrency(priceLocal, displayCurrency)}<span className="ml-2 font-normal text-muted-foreground">{quoteLoading ? '获取中' : valuation.priceStatus === 'unavailable' ? '暂无报价' : stale ? '最近成交价' : '现货参考'}</span></span>
      </div>
      <dl className="grid grid-cols-2 items-center gap-x-5 gap-y-6 px-5 py-5 md:grid-cols-4 md:gap-x-8">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">持有黄金</dt>
          <dd data-gold-field="grams"><GoldBar weight={grams(valuation.totalGrams)} /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">参考市值 · {displayCurrency}</dt>
          <dd data-gold-field="market-value" className="mt-2 break-all text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{displayAmount(valuation.totalCny)}</dd>
          <dd className="mt-1 text-xs text-muted-foreground tabular-nums">{valuation.totalUsd === null ? 'USD 汇总待换算' : fmtUsd(valuation.totalUsd)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">买入成本 · {displayCurrency}</dt>
          <dd data-gold-field="cost" className="mt-2 break-all text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{displayAmount(valuation.totalCostCny)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">浮动盈亏 · {displayCurrency}</dt>
          <dd data-gold-field="pnl" className={`mt-2 break-all text-xl font-semibold tracking-tight tabular-nums sm:text-2xl ${profitColor}`}>{!hidden && valuation.pnlCny !== null && valuation.pnlCny > 0 ? '+' : ''}{displayAmount(valuation.pnlCny)}</dd>
          <dd className={`mt-1 text-xs tabular-nums ${profitColor}`}>{hidden ? '******' : valuation.pnlPct === null ? '—' : `${valuation.pnlPct > 0 ? '+' : ''}${valuation.pnlPct.toFixed(2)}%`}</dd>
        </div>
      </dl>
      {holdings.length === 0 ? (
        <p className="border-t px-5 py-4 text-sm text-muted-foreground">暂无黄金持仓，添加克数和每克买入价即可开始记录。</p>
      ) : holdings.length === 1 ? (
        <div className="border-t px-5 pb-4">{records}</div>
      ) : (
        <details className="group border-t px-5 pb-5">
          <summary className="flex cursor-pointer list-none items-center gap-2 pt-4 text-sm [&::-webkit-details-marker]:hidden"><span>买入记录</span><span className="text-xs text-muted-foreground">{holdings.length} 笔</span><ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
          <div className="mt-1">{records}</div>
        </details>
      )}
      <div className="flex flex-wrap items-center justify-between gap-1 px-5 pb-4 pt-3 text-[11px] text-muted-foreground">
        <span><a href="https://finance.sina.com.cn/money/gold/" target="_blank" rel="noreferrer" className="hover:text-foreground">新浪财经</a> · 上金所 Au99.99{quote && valuation.priceStatus !== 'unavailable' && <> · <time dateTime={quote.updatedAt}>{new Date(quote.updatedAt).toLocaleString('zh-CN', { hour12: false })}</time></>}</span>
        <span>参考价不含加工费及回购折价</span>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? '编辑黄金' : '添加黄金'}</DialogTitle></DialogHeader>
          <GoldForm key={editing?.id ?? 'new'} initial={editing} onSave={holding => { if (editing) updateHolding(editing.id, holding); else addHolding(holding); setOpen(false); }} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
