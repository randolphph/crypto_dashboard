import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const load = createTsLoader();
const { DEFAULT_ASSET_CATEGORIES, aggregateAssetCategories, buildClassificationAssets, resolveAssetCategory, balanceCategoryKey, defaultBalanceCategory } = load('lib/portfolio/assetCategories.ts');
const config = () => ({ categories: structuredClone(DEFAULT_ASSET_CATEGORIES), assignments: {}, redirects: {}, defaultCategoryId: 'cash' });
const btc = { asset: 'BTC', amount: 1, usdValue: 500 };
const stable = { asset: 'USDC(ETH)', amount: 200, usdValue: 200, chainId: '1' };
const nvda = { asset: 'NVDAB', stockSymbol: 'NVDA', amount: 2, usdValue: 300 };
function fixture() {
  return {
    binance: { totalUsdValue: 1400, accounts: [{ label: '现货', balances: [btc, stable, nvda] }, { label: 'U本位合约', balances: [{ asset: 'USDT', amount: 400, usdValue: 400 }] }] },
    okx: { totalUsdValue: 1000, balances: [btc, stable, nvda] },
    deribit: { totalUsdValue: 500 },
    onchain: [{ walletId: 'w1', walletName: 'Main', address: '0xabc', chains: ['ethereum'], balances: [{ ...btc, usdValue: 100 }, stable, { asset: 'aUSDC', amount: 500, usdValue: 500, dedupedToDefi: true }], totalUsdValue: 800, defiPositions: [{ platformId: 'aave', platformName: 'Aave', network: 'Ethereum', chainId: '1', totalUsdValue: 500, positions: [{ totalUsdValue: 500, tokens: [{ usdValue: 500 }] }] }] }],
    stocks: { brokers: [{ broker: 'ibkr', totalUsdValue: 1300, positions: [{ id: 'nvda', symbol: 'NVDA', marketValueUsd: 300 }, { id: 'sgov', symbol: 'SGOV', marketValueUsd: 600 }, { id: 'option', symbol: 'NVDA', kind: 'option', marketValueUsd: -100 }], cash: [{ id: 'usd', currency: 'USD', amountUsd: 500 }] }] },
    banks: [{ id: 'bank1', bank: 'Test bank', currency: 'USD', valueUsd: 100 }],
    customAssets: [{ id: 'custom1', name: 'Manual asset', value: 75 }],
  };
}

test('default categories cover assets once using account equity, DeFi dedup and cash equivalents', () => {
  const assets = buildClassificationAssets(fixture());
  const buckets = aggregateAssetCategories(assets, config());
  assert.deepEqual(buckets.map((entry) => entry.label), ['现金及等价物', '股票', '加密资产', '美股']);
  assert.equal(assets.reduce((sum, entry) => sum + entry.value, 0), 5175);
  assert.equal(buckets.reduce((sum, entry) => sum + entry.value, 0), 5175);
  assert.equal(buckets.find((entry) => entry.id === 'stocks').value, 200);
  assert.equal(buckets.find((entry) => entry.id === 'us-stocks').value, 600);
  assert.equal(buckets.find((entry) => entry.id === 'cash').value, 1875);
  assert.equal(buckets.find((entry) => entry.id === 'crypto').value, 2500);
  assert.ok(!assets.some((entry) => entry.label === 'aUSDC'));
  assert.equal(defaultBalanceCategory(stable), 'cash');
  assert.equal(defaultBalanceCategory({ asset: 'USDT' }, false), 'crypto');
});

test('reclassification survives reordered API rows and preserves total value with negative holdings', () => {
  const input = fixture();
  const assets = buildClassificationAssets(input);
  const settings = config();
  const key = balanceCategoryKey({ source: 'okx' }, btc);
  settings.assignments[key] = 'cash';
  const before = aggregateAssetCategories(assets, settings);
  input.okx.balances.reverse();
  input.stocks.brokers[0].positions.reverse();
  const after = aggregateAssetCategories(buildClassificationAssets(input), settings);
  assert.deepEqual(after.map((entry) => entry.value), before.map((entry) => entry.value));
  assert.equal(after.find((entry) => entry.id === 'cash').value, 2375);
  const negatives = aggregateAssetCategories([{ id: 'short', label: 'Short', source: 'Broker', value: -1000, defaultCategoryId: 'stocks' }, { id: 'cash', label: 'Cash', source: 'Broker', value: 1100, defaultCategoryId: 'cash' }], settings);
  assert.equal(negatives.find((entry) => entry.id === 'stocks').value, -1000);
  assert.equal(negatives.reduce((sum, entry) => sum + entry.value, 0), 100);
});

test('source adjustments retain authoritative totals when upstream only returns some balance details', () => {
  const input = fixture();
  input.okx.totalUsdValue = 1100;
  const assets = buildClassificationAssets(input);
  assert.equal(assets.find((entry) => entry.id === 'source:okx:adjustment').value, 100);
  assert.equal(assets.reduce((sum, entry) => sum + entry.value, 0), 5275);
});

test('category CRUD, reassignment, default rules and reset survive reload without dropping assets', () => {
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  const map = new Map();
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
  globalThis.window = { localStorage: storage }; globalThis.localStorage = storage;
  try {
    const store = createTsLoader()('stores/assetCategoryStore.ts').useAssetCategoryStore;
    const assets = buildClassificationAssets(fixture());
    store.getState().addCategory('  债券  ');
    const id = store.getState().categories.find((entry) => entry.name === '债券').id;
    store.getState().assignCategory('stock:ibkr:sgov', id);
    store.getState().renameCategory(id, '固收资产');
    store.getState().setDefaultCategory(id);
    assert.equal(resolveAssetCategory(store.getState(), 'custom:custom1'), id);
    assert.equal(aggregateAssetCategories(assets, store.getState()).find((entry) => entry.id === id).value, 675);
    assert.throws(() => store.getState().addCategory('固收资产'), /已存在/);
    assert.throws(() => store.getState().renameCategory(id, ''), /名称/);
    assert.throws(() => store.getState().deleteCategory(id, id), /转入/);
    store.getState().deleteCategory('cash', id);
    assert.equal(resolveAssetCategory(store.getState(), 'bank:bank1', 'cash'), id);
    store.getState().deleteCategory(id, 'crypto');
    const restored = createTsLoader()('stores/assetCategoryStore.ts').useAssetCategoryStore;
    assert.equal(resolveAssetCategory(restored.getState(), 'bank:bank1', 'cash'), 'crypto');
    assert.equal(resolveAssetCategory(restored.getState(), 'stock:ibkr:sgov', 'cash'), 'crypto');
    assert.equal(aggregateAssetCategories(assets, restored.getState()).reduce((sum, entry) => sum + entry.value, 0), 5175);
    restored.getState().assignCategory('stock:ibkr:nvda', 'crypto');
    restored.getState().resetAssignment('stock:ibkr:nvda');
    assert.equal(resolveAssetCategory(restored.getState(), 'stock:ibkr:nvda', 'stocks'), 'stocks');
    restored.getState().deleteCategory('stocks', 'crypto');
    assert.throws(() => restored.getState().deleteCategory('crypto', 'stocks'), /至少保留/);
  } finally { globalThis.window = oldWindow; globalThis.localStorage = oldStorage; }
});

test('snapshot exports retain named manual allocation, including renamed custom categories', () => {
  const { buildSnapshot, snapshotFingerprint } = load('lib/portfolio/snapshot.ts');
  const { snapshotToAiJson, snapshotToMarkdown } = load('lib/snapshot/export.ts');
  const assetAllocation = [{ id: 'custom', label: '固收资产', value: 100 }];
  const snapshot = buildSnapshot({ wallet: '0x123', portfolio: { totalUsd: 100, assetsUsd: 100 }, assetAllocation });
  assert.deepEqual(snapshotToAiJson(snapshot).assetAllocation, assetAllocation);
  assert.match(snapshotToMarkdown(snapshot), /资产分类（按手工标签汇总）/);
  assert.match(snapshotToMarkdown(snapshot), /固收资产/);
  assert.notEqual(snapshotFingerprint(snapshot), snapshotFingerprint({ ...snapshot, assetAllocation: [{ ...assetAllocation[0], label: '债券' }] }));
});
