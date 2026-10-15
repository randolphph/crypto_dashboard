import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CATEGORY_PALETTE, DEFAULT_ASSET_CATEGORIES, US_STOCK_CATEGORY, US_STOCK_CATEGORY_ID, type CategoryConfiguration } from '@/lib/portfolio/assetCategories';
import { normalizeStockSymbol } from '@/lib/portfolio/assetStockMapping';

interface AssetCategoryState extends CategoryConfiguration {
  addCategory: (name: string) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string, replacementId: string) => void;
  assignCategory: (assetId: string, categoryId: string, stockSymbol?: string) => void;
  resetAssignment: (assetId: string) => void;
  setDefaultCategory: (id: string) => void;
}
function validName(name: string, state: CategoryConfiguration, except?: string) {
  const value = name.trim();
  if (!value || value.length > 30) throw new Error('分类名称需为 1–30 个字符');
  if (state.categories.some((c) => c.id !== except && c.name.toLowerCase() === value.toLowerCase())) throw new Error('分类名称已存在');
  return value;
}
export const useAssetCategoryStore = create<AssetCategoryState>()(persist((set) => ({
  categories: DEFAULT_ASSET_CATEGORIES,
  assignments: {}, redirects: {}, defaultCategoryId: 'cash', usStockSymbols: {},
  addCategory: (name) => set((state) => ({ categories: [...state.categories, { id: crypto.randomUUID(), name: validName(name, state), color: CATEGORY_PALETTE[state.categories.length % CATEGORY_PALETTE.length] }] })),
  renameCategory: (id, name) => set((state) => {
    const value = validName(name, state, id);
    return { categories: state.categories.map((entry) => entry.id === id ? { ...entry, name: value } : entry) };
  }),
  deleteCategory: (id, replacementId) => set((state) => {
    if (id === US_STOCK_CATEGORY_ID) throw new Error('美股为固定分类，不可删除');
    if (!state.categories.some((c) => c.id === id)) throw new Error('分类不存在');
    if (state.categories.filter((c) => c.id !== US_STOCK_CATEGORY_ID).length <= 1) throw new Error('至少保留一个普通分类作为默认分类');
    if (replacementId === id || !state.categories.some((c) => c.id === replacementId)) throw new Error('请选择转入分类');
    if (replacementId === US_STOCK_CATEGORY_ID) throw new Error('请先逐项选择美股并关联代码，再删除原分类');
    return { categories: state.categories.filter((c) => c.id !== id), assignments: Object.fromEntries(Object.entries(state.assignments).map(([key,value]) => [key, value === id ? replacementId : value])), redirects: { ...state.redirects, [id]: replacementId }, defaultCategoryId: state.defaultCategoryId === id ? replacementId : state.defaultCategoryId };
  }),
  assignCategory: (assetId, categoryId, stockSymbol) => set((state) => {
    if (!state.categories.some((c) => c.id === categoryId)) throw new Error('分类不存在');
    if (categoryId === US_STOCK_CATEGORY_ID) {
      const symbol = normalizeStockSymbol(stockSymbol ?? state.usStockSymbols?.[assetId] ?? '');
      return { assignments: { ...state.assignments, [assetId]: categoryId }, usStockSymbols: { ...state.usStockSymbols, [assetId]: symbol } };
    }
    return { assignments: { ...state.assignments, [assetId]: categoryId } };
  }),
  resetAssignment: (assetId) => set((state) => ({ assignments: Object.fromEntries(Object.entries(state.assignments).filter(([key]) => key !== assetId)) })),
  setDefaultCategory: (id) => set((state) => {
    if (id === US_STOCK_CATEGORY_ID) throw new Error('美股需逐项关联代码，不能用作通用默认分类');
    if (!state.categories.some((c) => c.id === id)) throw new Error('分类不存在');
    return { defaultCategoryId: id };
  }),
}), { name: 'crypto-dashboard-asset-categories', version: 2,
  migrate: (persisted) => {
    const state = persisted as CategoryConfiguration;
    const categories = state.categories ?? DEFAULT_ASSET_CATEGORIES;
    const existing = categories.find((entry) => entry.id === US_STOCK_CATEGORY_ID || entry.name === '美股');
    const assignments = Object.fromEntries(Object.entries(state.assignments ?? {}).map(([key,value]) => [key, existing && value === existing.id ? US_STOCK_CATEGORY_ID : value]));
    const usStockSymbols = { ...state.usStockSymbols };
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('crypto-dashboard-asset-stock-mappings') : null;
      const mappings = saved ? JSON.parse(saved)?.state?.mappings ?? [] : [];
      for (const mapping of mappings) {
        if (typeof mapping.key !== 'string' || typeof mapping.symbol !== 'string') continue;
        const id = `balance:${mapping.key}`;
        usStockSymbols[id] ??= normalizeStockSymbol(mapping.symbol);
        if (!assignments[id] || assignments[id] === 'stocks') assignments[id] = US_STOCK_CATEGORY_ID;
      }
    } catch { /* Invalid legacy metadata must not prevent category hydration. */ }
    return { ...state, categories: existing ? categories.map((entry) => entry.id === existing.id ? { ...entry, id: US_STOCK_CATEGORY_ID } : entry) : [...categories, US_STOCK_CATEGORY], usStockSymbols,
      assignments,
      redirects: { ...state.redirects, ...(existing && existing.id !== US_STOCK_CATEGORY_ID ? { [existing.id]: US_STOCK_CATEGORY_ID } : {}) },
      defaultCategoryId: state.defaultCategoryId === existing?.id ? categories.find((entry) => entry.id !== existing?.id)?.id ?? 'cash' : state.defaultCategoryId ?? 'cash',
    };
  },
}));
