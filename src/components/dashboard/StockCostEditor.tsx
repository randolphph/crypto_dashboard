'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useManualStockCostStore } from '@/stores/manualStockCostStore';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { valueManualStockCost, type StockCostValuation } from '@/lib/portfolio/manualStockCost';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function StockCostPnl({ cost }: { cost?: StockCostValuation }) {
  const { fmtUsd, percentHidden } = usePrivacyFormat();
  if (!cost || cost.pnlUsd === null) return <span className="text-muted-foreground">—</span>;
  return <span className={cost.pnlUsd >= 0 ? 'text-positive' : 'text-negative'}>
    {cost.pnlUsd > 0 ? '+' : ''}{fmtUsd(cost.pnlUsd)}
    {cost.pnlPct !== null && <span className="ml-1 text-xs">({percentHidden ? '**%' : `${cost.pnlPct > 0 ? '+' : ''}${cost.pnlPct.toFixed(1)}%`})</span>}
  </span>;
}

export function StockCostEditor({ assetId, symbol, label, amount, valueUsd, incomplete = false, protocol = false }: {
  assetId: string; symbol: string; label: string; amount?: number; valueUsd: number; incomplete?: boolean; protocol?: boolean;
}) {
  const record = useManualStockCostStore(s => s.costs[assetId]);
  const saved = record?.symbol === symbol ? record : undefined;
  const setCost = useManualStockCostStore(s => s.setCost), removeCost = useManualStockCostStore(s => s.removeCost);
  const { fmtUsd } = usePrivacyFormat();
  const [open, setOpen] = useState(false), [price, setPrice] = useState(''), [ratio, setRatio] = useState('1'), [quantity, setQuantity] = useState(''), [error, setError] = useState('');
  const draft = { symbol, buyPriceUsd: price.trim() ? Number(price) : NaN, sharesPerUnit: protocol ? 1 : ratio.trim() ? Number(ratio) : NaN, ...(protocol ? { quantity: quantity.trim() ? Number(quantity) : NaN } : {}) };
  const preview = valueManualStockCost(draft, symbol, amount, valueUsd, incomplete);
  const begin = () => { setPrice(saved ? String(saved.buyPriceUsd) : ''); setRatio(String(saved?.sharesPerUnit ?? 1)); setQuantity(saved?.quantity !== undefined ? String(saved.quantity) : ''); setError(''); setOpen(true); };
  return <>
    <button type="button" aria-label={`设置 ${label} 买入价`} onClick={begin} className="inline-flex items-center justify-center gap-1 rounded px-1 py-0.5 text-xs tabular-nums text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {saved ? fmtUsd(saved.buyPriceUsd) : '填写买入价'}<Pencil className="h-3 w-3" />
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>买入价 · {label}</DialogTitle></DialogHeader>
        <form noValidate className="space-y-4" onSubmit={event => {
          event.preventDefault();
          try { setCost(assetId, draft); setOpen(false); }
          catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); }
        }}>
          <p className="text-sm text-muted-foreground">关联标的 {symbol} · 以美元记录平均买入价</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-sm">{protocol ? '每股买入价 (USD)' : '每枚买入价 (USD)'}<Input autoFocus aria-label="买入单价 USD" type="number" min="0" step="any" inputMode="decimal" value={price} onChange={event => { setPrice(event.target.value); setError(''); }} placeholder="例如 120" /></label>
            {protocol ? <label className="space-y-2 text-sm">对应股票数量 (股)<Input aria-label="对应股票数量" type="number" min="0" step="any" inputMode="decimal" value={quantity} onChange={event => { setQuantity(event.target.value); setError(''); }} placeholder="填写实际对应股数" /></label>
              : <label className="space-y-2 text-sm">每枚对应股数<Input aria-label="每枚对应股数" type="number" min="0" step="any" inputMode="decimal" value={ratio} onChange={event => { setRatio(event.target.value); setError(''); }} /></label>}
          </div>
          <p className="text-xs text-muted-foreground">{protocol ? '使用填写的对应股数计算成本，市值使用当前 DeFi 持仓估值。' : '1 枚对应 1 股时填 1。成本按当前持有枚数计算；再次买入后可更新为加权平均买入价。'}</p>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">买入总成本 <span className="font-medium tabular-nums">{preview ? fmtUsd(preview.costUsd) : '—'}</span></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {saved && <Button type="button" variant="ghost" className="mr-auto text-destructive" onClick={() => { removeCost(assetId); setOpen(false); }}>清除买入价</Button>}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button type="submit">保存买入价</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
