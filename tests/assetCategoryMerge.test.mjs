import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const { aggregateAssetCategories, buildClassificationAssets, DEFAULT_ASSET_CATEGORIES, defiCategoryKey, stockCategoryKey } = createTsLoader()('lib/portfolio/assetCategories.ts');
const config = () => ({ categories: structuredClone(DEFAULT_ASSET_CATEGORIES), assignments: {}, redirects: {}, defaultCategoryId: 'cash', usStockSymbols: {} });
const balance = (asset, usdValue, extra = {}) => ({ asset, usdValue, amount: 1, ...extra });
const total = rows => rows.reduce((sum, row) => sum + row.usdValue, 0);
const exchange = balances => ({ balances, totalUsdValue: total(balances) });
const wallet = (balances, extra = {}) => ({ walletId: 'main', walletName: '主钱包', balances, totalUsdValue: total(balances), ...extra });
const position = (id, symbol, marketValueUsd, extra = {}) => ({ id, symbol, market: 'US', currency: 'USD', marketValueUsd, ...extra });
const broker = (broker, positions) => ({ broker, positions, cash: [], totalUsdValue: positions.reduce((sum, p) => sum + p.marketValueUsd, 0) });
const aggregate = (input, settings = config()) => aggregateAssetCategories(buildClassificationAssets({ banks: [], customAssets: [], ...input }), settings);
const bucket = (buckets, id) => buckets.find(bucket => bucket.id === id);
const sum = buckets => buckets.reduce((sum, bucket) => sum + bucket.value, 0);

test('crypto combines venue and chain fragments, including earn balances, without conflating wrapped assets or stablecoins', () => {
  const spot = [balance('BTC', 500), balance('ETH', 50), balance('WBTC', 25), balance('USDC', 300)];
  const input = { binance: { accounts: [{ label: '现货', balances: spot }, { label: '理财', balances: [balance('LDBTC', 30), balance('LDUSDC', 35)] }], totalUsdValue: total(spot) + 65 },
    okx: exchange([balance('btc', 100), balance('ETH', 75)]), onchain: [wallet([balance('BTC(BSC)', 200, { chainId: '56' }), balance('ETH(Arbitrum)', 100, { chainId: '42161' }), balance('USDC(ETH)', 250, { chainId: '1' }), balance('USDT', 10)])] };
  const original = structuredClone(input), buckets = aggregate(input), crypto = bucket(buckets, 'crypto').details;
  const btc = crypto.find(row => row.label === 'BTC');
  assert.equal(btc.value, 830);
  assert.deepEqual(btc.sources, [{ label: 'Binance 现货', value: 500 }, { label: 'Binance 理财', value: 30 }, { label: 'OKX', value: 100 }, { label: '主钱包', value: 200 }]);
  assert.deepEqual(btc.locations, ['Binance', 'OKX', '链上']);
  assert.equal(btc.merged, true);
  assert.equal(crypto.find(row => row.label.startsWith('WBTC')).merged, undefined);
  assert.equal(crypto.find(row => row.label === 'ETH').value, 225);
  assert.equal(crypto.find(row => row.label.startsWith('WBTC')).value, 25);
  assert.equal(bucket(buckets, 'cash').details.find(row => row.label === 'USDC').value, 585);
  assert.equal(bucket(buckets, 'cash').details.find(row => row.label.startsWith('USDT')).value, 10);
  assert.equal(sum(buckets), 1675);
  assert.deepEqual(input, original);
});

test('mapped token stocks, protocol tags, custom stock tags and native brokers combine once by canonical US ticker', () => {
  const settings = config(), protocolId = defiCategoryKey('main', 'pendle', '1');
  settings.assignments[protocolId] = 'us-stocks';settings.usStockSymbols[protocolId] = 'nvda';
  settings.assignments['custom:stock'] = 'us-stocks';settings.usStockSymbols['custom:stock'] = 'NVDA.US';
  const input = { binance: { accounts: [{ label: '现货', balances: [balance('NVDAB', 300, { stockSymbol: 'NVDA' })] }], totalUsdValue: 300 },
    okx: exchange([balance('NVDAx', 200, { stockSymbol: 'nvda.us' }), balance('NVDA', 10)]),
    onchain: [wallet([balance('NVDA(ETH)', 100, { stockSymbol: 'NVDA', chainId: '1' }), balance('PT-NVDA', 300, { dedupedToDefi: true })], { totalUsdValue: 400, defiPositions: [{ platformId: 'pendle', platformName: 'Pendle', chainId: '1', network: 'Ethereum', totalUsdValue: 300 }] })],
    stocks: { brokers: [broker('ibkr', [position('nvda', 'NVDA', 400), position('amd', 'AMD', 50)]), broker('longport', [position('nvda-lp', 'nvda.us', 100)])] }, customAssets: [{ id: 'stock', name: '手工股票', value: 75 }] };
  const original = structuredClone(input), buckets = aggregate(input, settings), stocks = bucket(buckets, 'us-stocks');
  const nvda = stocks.details.find(row => row.label === 'NVDA');
  assert.equal(stocks.details.length, 2);assert.equal(nvda.value, 1475);assert.deepEqual(nvda.icon, { symbol: 'NVDA', market: 'US' });
  assert.equal(nvda.sources.find(source => source.label === '主钱包').value, 400);
  assert.equal(nvda.sources.find(source => source.label === 'IBKR').value, 400);
  assert.deepEqual(nvda.locations, ['Binance', 'OKX', '链上', 'IBKR', '长桥', '自定义资产']);
  assert.equal(bucket(buckets, 'crypto').value, 10);assert.equal(sum(buckets), 1535);
  assert.deepEqual(input, original);
});

test('options stay separate from stock and only complete identical contracts combine across brokers', () => {
  const option = (id, value, extra = {}) => position(id, 'NVDA', value, { kind: 'option', expiry: '2026-12-18', strike: 200, optionType: 'call', multiplier: 100, ...extra });
  const input = { stocks: { brokers: [broker('ibkr', [position('stock', 'NVDA', 1000), option('call', 80), option('put', 90, { optionType: 'put' }), option('strike', 100, { strike: 210 }), option('expiry', 110, { expiry: '2027-01-15' }), option('adjusted', 120, { multiplier: 10 }), option('unknown-1', 10, { expiry: undefined })]), broker('longport', [option('same-call', -30), option('unknown-2', 20, { expiry: undefined })])] } };
  const stocks = bucket(aggregate(input), 'us-stocks');assert.equal(stocks.details.length, 8);
  assert.equal(stocks.details.find(row => row.id === JSON.stringify(['stock', 'US', 'NVDA'])).value, 1000);
  const call = stocks.details.find(row => row.value === 50);assert.match(call.displayLabel, /2026-12-18 200C/);assert.equal(call.sources.length, 2);
  assert.equal(stocks.value, 1500);assert.equal(new Set(stocks.details.map(row => row.id)).size, 8);
});

test('market identities, unknown token contracts and manual category assignments remain distinct', () => {
  const settings = config();settings.assignments[stockCategoryKey('ibkr', 'us')] = 'stocks';
  const input = { stocks: { brokers: [broker('ibkr', [position('us', '0700', 100), position('hk', '0700', 200, { market: 'HK', name: '腾讯控股' }), position('a', '600036.SH', 40, { market: 'A', name: '招商银行' })]), broker('longport', [position('hk2', '700.HK', 50, { market: 'HK', name: '腾讯控股' }), position('a2', '600036', 60, { market: 'A', name: '招商银行' })])] },
    onchain: [wallet([balance('UNKNOWN', 10, { chainId: '1', tokenAddress: '0xAA' }), balance('UNKNOWN', 20, { chainId: '1', tokenAddress: '0xBB' }), balance('UNKNOWN', 30, { chainId: '2', tokenAddress: '0xAA' })]), wallet([balance('UNKNOWN', 5, { chainId: '1', tokenAddress: '0xaa' })], { walletId: 'other', walletName: '另一个钱包' })] };
  const buckets = aggregate(input, settings), stocks = bucket(buckets, 'stocks').details, crypto = bucket(buckets, 'crypto').details;
  assert.equal(stocks.length, 3);
  assert.equal(stocks.find(row => row.label === '00700 · 腾讯控股').value, 250);
  assert.equal(stocks.find(row => row.label === '600036 · 招商银行').value, 100);
  assert.equal(crypto.length, 3);assert.equal(crypto.find(row => row.value === 15).sources.length, 2);
  assert.deepEqual(crypto.find(row => row.value === 15).locations, ['链上']);
  assert.equal(sum(buckets), 515);
});

test('merge precedes ranking and never overrides per-location categories or changes raw classification rows', () => {
  const accounts = Array.from({ length: 12 }, (_, i) => ({ label: '账户'+i, balances: [balance('BTC', 300)] }));
  const others = ['ETH','SOL','BNB','PENDLE','TRX','ENA','WBTC','WETH','LINK'].map((symbol, i) => balance(symbol, 100+i));
  const input = { binance: { accounts, totalUsdValue: 3600 }, okx: exchange(others) };
  const assets = buildClassificationAssets({ banks: [], customAssets: [], ...input }), settings = config();
  assert.equal(assets.length, 21);
  const original = structuredClone(assets), crypto = bucket(aggregateAssetCategories(assets, settings), 'crypto');
  assert.equal(crypto.details.length, 10);assert.equal(crypto.details[0].label, 'BTC');assert.equal(crypto.details[0].value, 3600);
  assert.deepEqual(assets, original);
  settings.assignments[assets[0].id] = 'cash';
  const reassigned = aggregateAssetCategories(assets, settings);assert.equal(bucket(reassigned, 'cash').value, 300);assert.equal(bucket(reassigned, 'crypto').details.find(row => row.label === 'BTC').value, 3300);
  assert.equal(sum(reassigned), sum([crypto]));
});
