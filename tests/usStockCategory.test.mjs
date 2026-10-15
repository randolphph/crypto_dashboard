import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const load = createTsLoader();
const { DEFAULT_ASSET_CATEGORIES, defaultStockCategory, resolveUsStockSymbol, defiCategoryKey } = load('lib/portfolio/assetCategories.ts');
const { annotateBalances, annotateWallets, assetMappingKey, mappedStockHoldings } = load('lib/portfolio/assetStockMapping.ts');
const { deriveTargets, orphanHoldings, rollupSectors } = load('lib/accumulation/derive.ts');
const storageKey = 'crypto-dashboard-asset-categories';
function withStorage(seed, run) {
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage;
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  globalThis.localStorage = storage; globalThis.window = { localStorage: storage };
  const restore = () => createTsLoader()('stores/assetCategoryStore.ts').useAssetCategoryStore;
  try { run(restore(), restore); }
  finally { globalThis.window = previousWindow; globalThis.localStorage = previousStorage; }
}
const oldState = () => ({ categories: DEFAULT_ASSET_CATEGORIES.filter((c) => c.id !== 'us-stocks'), assignments: {}, redirects: {}, defaultCategoryId: 'cash' });

test('US category is permanent and assignment requires a valid ticker atomically across reload', () => withStorage({}, (store, restore) => {
  assert.ok(store.getState().categories.some((c) => c.id === 'us-stocks'));
  assert.throws(() => store.getState().deleteCategory('us-stocks', 'stocks'), /不可删除/);
  assert.throws(() => store.getState().setDefaultCategory('us-stocks'), /逐项关联/);
  assert.throws(() => store.getState().deleteCategory('stocks', 'us-stocks'), /逐项选择/);
  for (const ticker of ['', 'NVDA US']) assert.throws(() => store.getState().assignCategory('custom:1', 'us-stocks', ticker), /有效美股代码/);
  assert.equal(store.getState().assignments['custom:1'], undefined);
  store.getState().assignCategory('custom:1', 'us-stocks', ' nvda ');
  const saved = restore().getState();
  assert.equal(saved.assignments['custom:1'], 'us-stocks');
  assert.equal(saved.usStockSymbols['custom:1'], 'NVDA');
}));

test('v1 migration adopts an existing US category and retains explicit non-US tags for legacy mappings', () => {
  const state = oldState();
  state.categories.push({ id: 'old-us', name: '美股', color: '#123456' });
  state.assignments = { 'custom:1': 'old-us', 'balance:cash-key': 'cash', 'balance:stock-key': 'stocks' };
  withStorage({ [storageKey]: { version: 1, state }, 'crypto-dashboard-asset-stock-mappings': { version: 1, state: { mappings: [{ key: 'cash-key', symbol: 'AMD' }, { key: 'stock-key', symbol: 'NVDA' }] } } }, (store, restore) => {
    const migrated = store.getState();
    assert.equal(migrated.categories.filter((c) => c.name === '美股').length, 1);
    assert.equal(migrated.assignments['custom:1'], 'us-stocks');
    assert.equal(migrated.redirects['old-us'], 'us-stocks');
    assert.equal(migrated.assignments['balance:stock-key'], 'us-stocks');
    assert.equal(resolveUsStockSymbol(migrated, 'balance:stock-key'), 'NVDA');
    assert.equal(resolveUsStockSymbol(migrated, 'balance:cash-key', 'AMD'), undefined);
    assert.equal(restore().getState().defaultCategoryId, 'cash');
  });
  withStorage({ [storageKey]: { version: 1, state: oldState() } }, (store) => {
    assert.ok(store.getState().categories.some((c) => c.id === 'us-stocks'));
  });
});

test('only the US tag activates associated AI holdings, retaining original units and values', () => withStorage({}, (store) => {
  const token = { asset: 'NVDAB', amount: 2, usdValue: 300 };
  const location = { source: 'okx' };
  const key = assetMappingKey(location, token), id = `balance:${key}`;
  const annotate = (mappings = []) => annotateBalances([token], location, mappings, (assetId, known) => resolveUsStockSymbol(store.getState(), assetId, known));
  store.getState().assignCategory(id, 'us-stocks', 'NVDA');
  assert.deepEqual(mappedStockHoldings({ okx: { balances: annotate() } }), [{ symbol: 'NVDA', market: 'US', valueUsd: 300, sourceLabel: 'OKX · NVDAB', amount: 2, assetSymbol: 'NVDAB' }]);
  store.getState().assignCategory(id, 'stocks');
  assert.deepEqual(annotate([{ key, symbol: 'NVDA' }]), [token]);
  assert.deepEqual(mappedStockHoldings({ okx: { balances: annotate() } }), []);
  store.getState().assignCategory(id, 'us-stocks');
  assert.equal(annotate()[0].stockSymbol, 'NVDA');
}));

test('native US equities supply their own ticker while cash ETFs and other markets retain defaults', () => {
  assert.equal(defaultStockCategory('NVDA', 'stock', 'US'), 'us-stocks');
  assert.equal(defaultStockCategory('NVDA', 'option', 'US'), 'us-stocks');
  assert.equal(defaultStockCategory('SGOV', 'stock', 'US'), 'cash');
  assert.equal(defaultStockCategory('600519', 'stock', 'CN'), 'stocks');
  assert.equal(defaultStockCategory('0700', 'stock', 'HK'), 'stocks');
  const config = { ...oldState(), categories: DEFAULT_ASSET_CATEGORIES };
  assert.equal(resolveUsStockSymbol(config, 'stock:1', 'NVDA', defaultStockCategory('NVDA', 'stock', 'US')), 'NVDA');
  assert.equal(resolveUsStockSymbol(config, 'stock:2', 'SGOV', defaultStockCategory('SGOV', 'stock', 'US')), undefined);
});

const pendleWallet = () => ({ walletId: 'w1', walletName: 'Main', address: '0x123', chains: ['ethereum'], totalUsdValue: 1500,
  balances: [{ asset: 'NVDAB', amount: 2, usdValue: 300 }, { asset: 'PT-NVDA', amount: 10, usdValue: 1200, dedupedToDefi: true }],
  defiTotalUsdValue: 1200,
  defiPositions: [{ platformId: 'pendle', platformName: 'Pendle', network: 'Ethereum', chainId: '1', totalUsdValue: 1200,
    positions: [{ type: 'pool', totalUsdValue: 9999, tokens: [{ symbol: 'PT-NVDA', amount: 10, usdValue: 9999 }] }] }],
});

test('a persisted Pendle US tag joins broker and token NVDA exactly once using protocol value and original quantities', () => withStorage({}, (store, restore) => {
  const raw = pendleWallet();
  store.getState().assignCategory(defiCategoryKey('w1', 'pendle', '1'), 'us-stocks', 'nvda');
  const state = restore().getState();
  const balanceKey = assetMappingKey({ source: 'onchain', walletId: 'w1' }, raw.balances[0]);
  const onchain = annotateWallets([raw], [{ key: balanceKey, symbol: 'NVDA' }], (id, known) => resolveUsStockSymbol(state, id, known));
  assert.equal(onchain[0].defiPositions[0].stockSymbol, 'NVDA');
  const holdings = mappedStockHoldings({ onchain });
  assert.equal(holdings.length, 2);
  assert.equal(holdings.reduce((sum, holding) => sum + holding.valueUsd, 0), 1500);
  const target = { id: 'nvda', symbol: 'NVDA', market: 'US', sector: 'AI', ma20: 100, tierOffsets: [-0.03, -0.06, -0.1], status: 'active' };
  const stocks = { brokers: [{ positions: [{ id: 'nvda', market: 'US', symbol: 'NVDA', shares: 3, price: 100, marketValueUsd: 300 }] }] };
  const [derived] = deriveTargets([target], stocks, { open: false, sectors: {} }, [], {}, holdings);
  assert.equal(derived.currentValue, 1800);
  assert.equal(rollupSectors([derived])[0].currentValue, 1800);
  assert.deepEqual(derived.quantities.map(({ amount, unit, label }) => ({ amount, unit, label })), [{ amount: 3, unit: '股', label: undefined }, { amount: 2, unit: '枚', label: 'NVDAB' }, { amount: 10, unit: '枚', label: 'PT-NVDA' }]);
  assert.ok(derived.mappedSources.some((source) => source.includes('Pendle') && source.includes('Ethereum')));
  assert.equal(orphanHoldings([], stocks, holdings)[0].currentValue, 1800);
  assert.deepEqual(raw, pendleWallet());
}));

test('DeFi US tags are isolated by wallet and chain, clear stale mappings when retagged, and never fabricate shares', () => withStorage({}, (store) => {
  const first = pendleWallet();
  first.balances = [];
  first.defiPositions[0].positions = [];
  const otherWallet = { ...structuredClone(first), walletId: 'w2' };
  const otherChain = { ...structuredClone(first), defiPositions: [{ ...first.defiPositions[0], chainId: '42161', network: 'Arbitrum' }] };
  const id = defiCategoryKey('w1', 'pendle', '1');
  const annotate = (rows) => annotateWallets(rows, [], (key, known) => resolveUsStockSymbol(store.getState(), key, known));
  store.getState().assignCategory(id, 'us-stocks', 'NVDA');
  const marked = annotate([first, otherWallet, otherChain]);
  const holdings = mappedStockHoldings({ onchain: marked });
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0].valueUsd, 1200);
  const target = { id: 'nvda', symbol: 'NVDA', market: 'US', sector: 'AI', ma20: 100, tierOffsets: [-0.03, -0.06, -0.1], status: 'active' };
  assert.deepEqual(deriveTargets([target], undefined, { open: false, sectors: {} }, [], {}, holdings)[0].quantities, []);
  store.getState().assignCategory(id, 'crypto');
  const unmarked = annotate(marked);
  assert.equal(unmarked[0].defiPositions[0].stockSymbol, undefined);
  assert.deepEqual(mappedStockHoldings({ onchain: unmarked }), []);
  store.getState().assignCategory(id, 'us-stocks', 'AMD');
  assert.equal(mappedStockHoldings({ onchain: annotate([first]) })[0].symbol, 'AMD');
}));
