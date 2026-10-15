'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAssetCategoryStore } from '@/stores/assetCategoryStore';
import { resolveAssetCategory, US_STOCK_CATEGORY_ID, type ClassificationAsset } from '@/lib/portfolio/assetCategories';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { AssetCategorySelect } from './AssetCategorySelect';
import { CategoryDropdown } from './CategoryDropdown';

export function AssetCategoryManager({ assets }: { assets: ClassificationAsset[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'categories' | 'assets'>('categories');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replacement, setReplacement] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const config = useAssetCategoryStore();
  const { fmtUsd } = usePrivacyFormat();
  const apply = (work: () => void) => { try { work(); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); } };
  const filtered = assets.filter((asset) => (filter === 'all' || resolveAssetCategory(config, asset.id, asset.defaultCategoryId) === filter) && `${asset.label} ${asset.source}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <Button size="sm" variant="outline" onClick={() => { setOpen(true); setError(''); }}>管理分类</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>资产分类</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'categories' ? 'default' : 'outline'} onClick={() => setTab('categories')}>分类管理</Button>
          <Button size="sm" variant={tab === 'assets' ? 'default' : 'outline'} onClick={() => setTab('assets')}>资产标签</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {tab === 'categories' ? <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">默认分类
            <CategoryDropdown label="默认分类" value={config.defaultCategoryId} categories={config.categories.filter((c) => c.id !== US_STOCK_CATEGORY_ID)} onValueChange={(id) => apply(() => config.setDefaultCategory(id))} />
          </div>
          <p className="text-xs text-muted-foreground">股票、现金和代币按类型预选分类；自定义资产使用默认分类。每项都可单独修改。</p>
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); apply(() => { config.addCategory(name); setName(''); }); }}>
            <Input aria-label="新分类名称" placeholder="新分类名称" value={name} maxLength={30} onChange={(event) => setName(event.target.value)} />
            <Button type="submit">添加分类</Button>
          </form>
          <div className="space-y-2">
            {config.categories.map((category) => {
              const count = assets.filter((asset) => resolveAssetCategory(config, asset.id, asset.defaultCategoryId) === category.id).length;
              return <div key={category.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {editing === category.id ? <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); apply(() => { config.renameCategory(category.id, draft); setEditing(null); }); }}>
                    <Input aria-label="修改分类名称" value={draft} maxLength={30} onChange={(event) => setDraft(event.target.value)} />
                    <Button type="submit" size="sm">保存名称</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                  </form> : <>
                    <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} /><span className="break-all">{category.name}</span><span className="text-xs text-muted-foreground">{count} 项</span>{category.id === US_STOCK_CATEGORY_ID && <span className="text-xs text-muted-foreground">不可删除</span>}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" aria-label={`重命名分类 ${category.name}`} onClick={() => { setEditing(category.id); setDraft(category.name); }}>改名</Button>
                      <Button size="sm" variant="ghost" disabled={category.id === US_STOCK_CATEGORY_ID || config.categories.filter((c) => c.id !== US_STOCK_CATEGORY_ID).length <= 1} aria-label={`删除分类 ${category.name}`} onClick={() => { setDeleting(category.id); setReplacement(config.categories.find((c) => c.id !== category.id && c.id !== US_STOCK_CATEGORY_ID)?.id ?? ''); }}>删除</Button>
                    </div>
                  </>}
                </div>
                {deleting === category.id && <div className="space-y-2 rounded bg-muted p-2 text-xs">
                  <p>删除“{category.name}”后，关联资产及其默认规则转入：</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryDropdown label="删除后转入分类" value={replacement} categories={config.categories.filter((c) => c.id !== category.id && c.id !== US_STOCK_CATEGORY_ID)} onValueChange={setReplacement} />
                    <Button size="sm" onClick={() => apply(() => { config.deleteCategory(category.id, replacement); setDeleting(null); if (filter === category.id) setFilter(replacement); })}>转移并删除</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(null)}>取消</Button>
                  </div>
                </div>}
              </div>;
            })}
          </div>
        </div> : <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><Input className="min-w-0 flex-1" aria-label="搜索分类资产" placeholder="搜索名称或来源" value={search} onChange={(event) => setSearch(event.target.value)} /><CategoryDropdown label="筛选资产分类" value={filter} categories={[{ id: 'all', name: '全部分类' }, ...config.categories]} onValueChange={setFilter} /></div>
          <p className="text-xs text-muted-foreground">{filtered.length} 项 · 负债单独计入净资产，不计入饼图；合约账户按净值计入，合约名义金额和 DeFi 底层明细不重复计算。</p>
          {filtered.map((asset) => <div key={asset.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
            <div className="min-w-0 flex-1"><p className="break-words">{asset.label}</p><p className="text-xs text-muted-foreground">{asset.source} · {fmtUsd(asset.value)}</p></div>
            <div className="flex items-center gap-1"><AssetCategorySelect assetId={asset.id} label={`${asset.label} ${asset.source}`} defaultCategoryId={asset.defaultCategoryId} nativeStockSymbol={asset.nativeStockSymbol} />{config.assignments[asset.id] && <button className="text-xs text-muted-foreground underline" aria-label={`恢复 ${asset.label} 的默认分类`} onClick={() => apply(() => config.resetAssignment(asset.id))}>重置</button>}</div>
          </div>)}
          {filtered.length === 0 && <p className="py-5 text-center text-sm text-muted-foreground">没有匹配的资产</p>}
        </div>}
      </DialogContent>
    </Dialog>
  </>;
}
