import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const load = createTsLoader();
const { assetMappingKey, normalizeStockSymbol, annotateBalances, annotateExchange, annotateWallets, mappedStockHoldings } = load('lib/portfolio/assetStockMapping.ts');
const { deriveTargets, orphanHoldings, rollupSectors } = load('lib/accumulation/derive.ts');
const { classifyBinance, classifyOkx, classifyOnchain } = load('lib/portfolio/category.ts');
const { buildPositionBreakdown } = load('lib/portfolio/positions.ts');
const { buildEconomicAllocationInput, applyEconomicAnalysis } = load('lib/ai/portfolioAllocation.ts');
const { buildSnapshot, snapshotFingerprint } = load('lib/portfolio/snapshot.ts');
const { snapshotToAiJson, snapshotToMarkdown } = load('lib/snapshot/export.ts');

const token = { asset: 'nvdab', amount: 2, usdValue: 300, chainId: '1', tokenAddress: '0xAbCd' };
const btc = { asset: 'BTC', amount: 0.1, usdValue: 500 };
const usdt = { asset: 'USDT', amount: 200, usdValue: 200 };
const wallet = { walletId: 'w1', walletName: 'Test wallet', address: '0x123456789', chains: ['ethereum'], balances: [token, btc, usdt], totalUsdValue: 1000 };
const mapping = (location, balance = token, symbol = 'NVDA') => ({ key: assetMappingKey(location, balance), symbol });

function fixtures() {
  const binance = { accounts: [{ label: '现货', balances: [token, btc, usdt], totalUsdValue: 1000 }] };
  const okx = { balances: [token, btc, usdt], totalUsdValue: 1000 };
  const mappings = [mapping({ source: 'binance', account: '现货' }), mapping({ source: 'okx' }), mapping({ source: 'onchain', walletId: 'w1' })];
  return { binance: annotateExchange(binance, 'binance', mappings), okx: annotateExchange(okx, 'okx', mappings), onchain: annotateWallets([wallet], mappings) };
}

test('mapping identity survives balance reordering and isolates venue, account, wallet, network and token address', () => {
  const location = { source: 'onchain', walletId: 'w1' };
  const mappings = [mapping(location)];
  const results = annotateBalances([btc, { ...token, tokenAddress: '0xabcd', asset: 'renamed' }, { ...token, chainId: '8453' }, { ...token, tokenAddress: '0x1111' }], location, mappings);
  assert.equal(results[1].stockSymbol, 'NVDA');
  assert.equal(results[0].stockSymbol, undefined);
  assert.equal(results[2].stockSymbol, undefined);
  assert.equal(results[3].stockSymbol, undefined);
  for (const other of [{ source: 'onchain', walletId: 'w2' }, { source: 'binance', account: '现货' }, { source: 'okx' }]) assert.equal(annotateBalances([token], other, mappings)[0].stockSymbol, undefined);
  const binanceMapping = [mapping({ source: 'binance', account: '现货' })];
  assert.equal(annotateBalances([token], { source: 'binance', account: '理财' }, binanceMapping)[0].stockSymbol, undefined);
  assert.notEqual(assetMappingKey(location, { ...token, tokenAddress: 'SolANA' }), assetMappingKey(location, { ...token, tokenAddress: 'Solana' }));
});

test('mapping removal clears cached annotations and does not change raw valuations or excluded DeFi receipts', () => {
  const location = { source: 'okx' };
  const raw = structuredClone(token);
  const mapped = annotateBalances([token], location, [mapping(location)]);
  assert.equal(mapped[0].stockSymbol, 'NVDA');
  assert.deepEqual(token, raw);
  assert.deepEqual(annotateBalances(mapped, location, []), [raw]);
  const receipt = { ...token, dedupedToDefi: true };
  assert.equal(annotateBalances([receipt], location, [mapping(location)])[0].stockSymbol, undefined);
  const futures = { source: 'binance', account: 'U本位合约' };
  assert.equal(annotateBalances([token], futures, [mapping(futures)])[0].stockSymbol, undefined);
});

test('category and directional breakdown move exactly the marked value from crypto into stocks', () => {
  const data = fixtures();
  for (const split of [classifyBinance(data.binance), classifyOkx(data.okx), classifyOnchain(data.onchain)]) assert.deepEqual(split, { cash: 200, crypto: 500, stocks: 300 });
  const breakdown = buildPositionBreakdown(data);
  assert.equal(breakdown.find((row) => row.label === '股票现货').value, 900);
  assert.equal(breakdown.find((row) => row.label === '加密现货').value, 1500);
  assert.ok(breakdown.find((row) => row.label === '股票现货').details.every((row) => row.label.includes('NVDA (nvdab)')));
});

test('AI economic classification respects explicit stock mappings even if the model proposes crypto', () => {
  const input = buildEconomicAllocationInput({ ...fixtures(), totalValue: 3000, categoryBreakdown: [{ label: '现金', value: 600 }, { label: '加密', value: 1500 }, { label: '股票', value: 900 }], bankCash: [], customAssets: [] });
  const stocks = input.candidates.filter((row) => row.userStockSymbol);
  assert.equal(stocks.length, 3);
  assert.ok(stocks.every((row) => row.baseCategory === '股票' && row.label.includes('NVDA (nvdab)') && row.description.includes('美股 NVDA')));
  const result = applyEconomicAnalysis(input, { summary: '', classifications: stocks.map((row) => ({ id: row.id, category: '加密资产', reason: 'wrong' })) });
  assert.equal(result.find((row) => row.label === '股票').value, 900);
  assert.equal(result.find((row) => row.label === '加密资产').value, 1500);
  assert.equal(result.reduce((sum, row) => sum + row.value, 0), 3000);
});

test('snapshot and AI JSON/Markdown retain token units and venue, include stocks once and aggregate NVDA exposure', () => {
  const input = { ...fixtures(), wallet: '0x1234', portfolio: { totalUsd: 3000, stocksUsd: 900, cryptoUsd: 1500, cashUsd: 600 } };
  const snapshot = buildSnapshot(input);
  const stockRows = snapshot.positions.filter((row) => row.kind === 'stock');
  assert.equal(stockRows.length, 3);
  assert.ok(stockRows.every((row) => row.symbol === 'NVDA' && row.assetSymbol === 'nvdab' && row.quantityUnit === 'token' && row.market === 'US' && row.qty === 2 && row.priceLocal === 150));
  assert.equal(stockRows.find((row) => row.source === 'onchain').chainId, '1');
  const ai = snapshotToAiJson(snapshot);
  assert.equal(ai.summary.byCategory.stocksLongUsd, 900);
  assert.equal(ai.summary.byCategory.cryptoSpotUsd, 1500);
  assert.equal(ai.summary.byCategory.cashImpliedUsd, 600);
  assert.equal(ai.summary.byUnderlying.find((row) => row.underlying === 'NVDA').netUsd, 900);
  for (const source of ['binance', 'okx', 'onchain']) {
    assert.equal(ai.summary.byVenue[source], 1000);
    assert.equal(ai.venues[source].stocks[0].assetSymbol, 'nvdab');
    assert.equal(ai.venues[source].stocks[0].qty, 2);
    assert.deepEqual(ai.venues[source].spotNonStable.map((row) => row.symbol), ['BTC']);
  }
  const markdown = snapshotToMarkdown(snapshot);
  assert.match(markdown, /NVDA（nvdab/);
  assert.match(markdown, /数量为原代币数量/);
  const changed = structuredClone(snapshot);
  changed.positions.find((row) => row.kind === 'stock').symbol = 'AMD';
  assert.notEqual(snapshotFingerprint(snapshot), snapshotFingerprint(changed));
});

test('invalid tickers are rejected and mappings survive reload, update and removal', () => {
  assert.equal(normalizeStockSymbol(' nvda '), 'NVDA');
  assert.equal(normalizeStockSymbol('brk.b'), 'BRK.B');
  for (const value of ['', 'NVDA US', '<script>', 'A'.repeat(21)]) assert.throws(() => normalizeStockSymbol(value));
  const previous = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  globalThis.window = { localStorage: globalThis.localStorage };
  try {
    const store = createTsLoader()('stores/assetStockMappingStore.ts').useAssetStockMappingStore;
    const key = assetMappingKey({ source: 'okx' }, token);
    store.getState().setMapping(key, ' nvda ');
    assert.throws(() => store.getState().setMapping(key, 'bad value'));
    assert.equal(store.getState().mappings[0].symbol, 'NVDA');
    const restored = createTsLoader()('stores/assetStockMappingStore.ts').useAssetStockMappingStore;
    assert.deepEqual(restored.getState().mappings, [{ key, symbol: 'NVDA' }]);
    restored.getState().setMapping(key, 'AMD');
    assert.deepEqual(restored.getState().mappings, [{ key, symbol: 'AMD' }]);
    restored.getState().removeMapping(key);
    assert.deepEqual(createTsLoader()('stores/assetStockMappingStore.ts').useAssetStockMappingStore.getState().mappings, []);
  } finally { globalThis.localStorage = previous; globalThis.window = previousWindow; }
});

test('AI positions merge tokenized and broker NVDA values, quick-add orphans and use underlying stock prices', () => {
  const holdings = mappedStockHoldings(fixtures());
  assert.equal(holdings.length, 3);
  const target = { id: 'nvda', market: 'US', symbol: 'NVDA', sector: 'AI', ma20: 200, tierOffsets: [-0.03, -0.06, -0.1], status: 'active' };
  const quotes = [{ market: 'US', symbol: 'NVDA', price: 210, currency: 'USD' }];
  const gate = { open: false, sectors: {}, version: 0 };
  const orphan = orphanHoldings([], undefined, holdings, quotes);
  assert.equal(orphan.length, 1);
  assert.equal(orphan[0].currentValue, 900);
  assert.equal(orphan[0].priceLocal, 210);
  const [tokenOnly] = deriveTargets([target], undefined, gate, quotes, {}, holdings);
  assert.equal(tokenOnly.currentValue, 900);
  assert.equal(tokenOnly.livePrice, 210); // token price is 150, never a stock quote
  assert.equal(tokenOnly.isHeld, true);
  assert.equal(tokenOnly.pnlUsd, null);
  assert.equal(tokenOnly.mappedSources.length, 3);
  assert.equal(orphanHoldings([target], undefined, holdings).length, 0);
  const stocks = { brokers: [{ broker: 'ibkr', positions: [{ market: 'US', symbol: 'NVDA', price: 210, shares: 2, marketValueUsd: 420, pnlUsd: 20, costBasis: 200 }] }] };
  const combined = deriveTargets([target], stocks, gate, quotes, {}, holdings);
  assert.equal(combined[0].currentValue, 1320);
  assert.equal(combined[0].pnlUsd, null); // partial broker PnL must not imply total PnL
  assert.equal(rollupSectors(combined)[0].currentValue, 1320);
  assert.equal(orphanHoldings([], stocks, holdings, quotes)[0].currentValue, 1320);
  assert.equal(deriveTargets([target], stocks, gate, quotes)[0].currentValue, 420);
});

test('AI quantity column sums broker shares exactly and keeps options and mapped token units separate', () => {
  const target = { id: 'nvda', market: 'US', symbol: 'NVDA', sector: 'AI', ma20: 200, tierOffsets: [-0.03, -0.06, -0.1], status: 'active' };
  const gate = { open: false, sectors: {}, version: 0 };
  const stocks = { brokers: [{ positions: [
    { id: 'ibkr-stock', market: 'US', symbol: 'NVDA', shares: 0.1, price: 200, marketValueUsd: 20 },
    { id: 'longport-stock', market: 'US', symbol: 'nvda', shares: 0.2, price: 200, marketValueUsd: 40 },
    { id: 'short-stock', market: 'US', symbol: 'NVDA', shares: -0.05, price: 200, marketValueUsd: -10 },
    { id: 'nvda-option', market: 'US', symbol: 'NVDA', kind: 'option', shares: -2, multiplier: 100, price: 10, marketValueUsd: -2000 },
    { id: 'other', market: 'US', symbol: 'AMD', shares: 1000, price: 100, marketValueUsd: 100000 },
  ] }] };
  const holdings = mappedStockHoldings(fixtures());
  const [row] = deriveTargets([target], stocks, gate, [], {}, holdings);
  assert.deepEqual(row.quantities[0], { amount: 0.25, unit: '股' });
  assert.deepEqual(row.quantities[1], { amount: -2, unit: '张', label: '期权', source: 'nvda-option' });
  assert.equal(row.quantities.length, 5);
  assert.ok(row.quantities.slice(2).every((entry) => entry.amount === 2 && entry.unit === '枚' && entry.label === 'nvdab'));
  assert.deepEqual(deriveTargets([target], undefined, gate)[0].quantities, []);
});
