'use client';

import { useState } from 'react';
import { useAssetCategoryStore } from '@/stores/assetCategoryStore';
import { useAssetStockMappingStore } from '@/stores/assetStockMappingStore';
import { resolveAssetCategory, US_STOCK_CATEGORY_ID } from '@/lib/portfolio/assetCategories';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CategoryDropdown } from './CategoryDropdown';

export function AssetCategorySelect({ assetId, label, defaultCategoryId, nativeStockSymbol, compact = false }: { assetId: string; label: string; defaultCategoryId?: string; nativeStockSymbol?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [error, setError] = useState('');
  const categories = useAssetCategoryStore((s) => s.categories);
  const redirects = useAssetCategoryStore((s) => s.redirects);
  const defaultId = useAssetCategoryStore((s) => s.defaultCategoryId);
  const assignment = useAssetCategoryStore((s) => s.assignments[assetId]);
  const savedSymbol = useAssetCategoryStore((s) => s.usStockSymbols?.[assetId]);
  const legacySymbol = useAssetStockMappingStore((s) => assetId.startsWith('balance:') ? s.mappings.find((entry) => entry.key === assetId.slice(8))?.symbol : undefined);
  const assign = useAssetCategoryStore((s) => s.assignCategory);
  const config = { categories, redirects, defaultCategoryId: defaultId, assignments: assignment ? { [assetId]: assignment } : {} };
  const value = resolveAssetCategory(config, assetId, defaultCategoryId);
  const known = nativeStockSymbol ?? savedSymbol ?? legacySymbol;
  const openAssociation = () => { setSymbol(known ?? ''); setError(''); setOpen(true); };
  return <span className={`inline-flex max-w-full items-center gap-1 ${compact ? 'min-w-0 shrink-0 flex-nowrap' : 'flex-wrap'}`}>
    <CategoryDropdown compact={compact} label={`${label} 的分类`} value={value} categories={categories} onValueChange={(categoryId) => {
      if (categoryId === US_STOCK_CATEGORY_ID && !nativeStockSymbol) { openAssociation(); return; }
      assign(assetId, categoryId, nativeStockSymbol);
    }} />
    {value === US_STOCK_CATEGORY_ID && !nativeStockSymbol && <button type="button" aria-label={`关联 ${label} 的美股代码`} className={`shrink-0 rounded-md text-xs font-normal text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${compact ? 'h-5 max-w-16 truncate px-1 text-[10px]' : 'px-1.5 py-1'}`} onClick={openAssociation}>{known ?? '关联代码'}</button>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>关联美股 · {label}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); try { assign(assetId, US_STOCK_CATEGORY_ID, symbol); setOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); } }}>
          <p className="text-sm text-muted-foreground">选择美股分类需关联对应代码。数量和估值仍使用原资产口径。</p>
          <label className="block space-y-2 text-sm">对应美股代码<Input value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="例如 NVDA" maxLength={20} autoFocus /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button type="submit">保存并关联</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </span>;
}
