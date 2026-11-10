import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';
const load = createTsLoader();
const { validateManualStockCost, valueManualStockCost } = load('lib/portfolio/manualStockCost.ts');
const { assetMappingKey, annotateBalances, annotateExchange, annotateWallets, mappedStockHoldings, defiCategoryKey } = load('lib/portfolio/assetStockMapping.ts');
const { deriveTargets } = load('lib/accumulation/derive.ts');
const { buildSnapshot, snapshotFingerprint } = load('lib/portfolio/snapshot.ts');
const { snapshotToAiJson, snapshotToMarkdown } = load('lib/snapshot/export.ts');
const token = { asset: 'NVDAx', amount: 2, usdValue: 300, chainId: '1', tokenAddress: '0xAbCd' };
const entry = (patch = {}) => ({ symbol: 'NVDA', buyPriceUsd: 100, sharesPerUnit: 1, ...patch });
const target = { id: 'qa', symbol: 'NVDA', market: 'US', sector: 'AI', ma20: 210, tierOffsets: [-.03, -.06, -.1], status: 'active' };
const gate = { open: false, sectors: {}, version: 0 };
const quote = [{ symbol: 'NVDA', market: 'US', price: 210, currency: 'USD' }];
const location = { source: 'okx' };
const key = assetMappingKey(location, token), id = `balance:${key}`;
const mark = [{ key, symbol: 'NVDA' }];
function mapped(costs) { return annotateExchange({ balances: [token], totalUsdValue: 300 }, 'okx', mark, undefined, { [id]: costs }); }

test('manual prices validate zero cost, fractional stock conversion and protocol quantity without accepting malformed inputs', () => {
  assert.equal(validateManualStockCost(entry({ symbol: ' nvda ' })).symbol, 'NVDA');
  assert.equal(validateManualStockCost(entry({ buyPriceUsd: 0 })).buyPriceUsd, 0);
  for (const patch of [{ buyPriceUsd: NaN }, { buyPriceUsd: Infinity }, { buyPriceUsd: -1 }, { sharesPerUnit: 0 }, { sharesPerUnit: -1 }, { sharesPerUnit: Infinity }, { quantity: 0 }, { quantity: -1 }, { quantity: 2, sharesPerUnit: 2 }, { symbol: '<script>' }]) assert.throws(() => validateManualStockCost(entry(patch)));
  const cost = valueManualStockCost(entry({ buyPriceUsd: 240, sharesPerUnit: 2 }), 'NVDA', 2, 600);
  assert.equal(cost.costUsd, 480);
  assert.equal(cost.pnlUsd, 120);
  assert.equal(cost.pnlPct, 25);
  assert.equal(cost.underlyingShares, 4);
  assert.equal(cost.costBasisUsd, 120);
  assert.equal(valueManualStockCost(entry({ buyPriceUsd: .2 }), 'NVDA', .1, .03).costUsd, .02);
  const free = valueManualStockCost(entry({ buyPriceUsd: 0 }), 'NVDA', 2, 300);
  assert.equal(free.pnlUsd, 300); assert.equal(free.pnlPct, null);
});

test('cost annotation is isolated by venue, account, wallet and token; refresh changes quantities without changing live valuation', () => {
  const result = mapped(entry());
  assert.equal(result.balances[0].stockCost.costUsd, 200);
  assert.equal(result.balances[0].stockCost.pnlUsd, 100);
  assert.equal(result.totalUsdValue, 300);
  assert.equal(result.balances[0].usdValue, 300);
  assert.equal(token.stockCost, undefined);
  const other = { source: 'binance', account: '现货' };
  assert.equal(annotateBalances([token], other, [{ key: assetMappingKey(other, token), symbol: 'NVDA' }], undefined, { [id]: entry() })[0].stockCost, undefined);
  const grown = annotateBalances([{ ...token, amount: 3, usdValue: 450 }], location, mark, undefined, { [id]: entry() })[0];
  assert.equal(grown.stockCost.costUsd, 300); assert.equal(grown.stockCost.pnlUsd, 150); assert.equal(grown.usdValue, 450);
  const wloc = { source: 'onchain', walletId: 'w1' }, wkey = assetMappingKey(wloc, token);
  const annotated = annotateBalances([token, { ...token, chainId: '8453' }, { ...token, tokenAddress: '0xffff' }], wloc, [{ key: wkey, symbol: 'NVDA' }], undefined, { [`balance:${wkey}`]: entry() });
  assert.equal(annotated[0].stockCost.costUsd, 200); assert.equal(annotated[1].stockCost, undefined); assert.equal(annotated[2].stockCost, undefined);
});

test('clearing costs or changing associations strips cached manual metadata; excluded receipts and futures remain excluded', () => {
  const annotated = mapped(entry()).balances;
  assert.equal(annotateBalances(annotated, location, mark)[0].stockCost, undefined);
  const retagged = annotateBalances(annotated, location, [{ key, symbol: 'AMD' }], undefined, { [id]: entry() })[0];
  assert.equal(retagged.stockSymbol, 'AMD'); assert.equal(retagged.stockCost, undefined);
  assert.equal(annotateBalances(annotated, location, [], () => undefined, { [id]: entry() })[0].stockCost, undefined);
  assert.equal(annotateBalances([{ ...token, dedupedToDefi: true }], location, mark, undefined, { [id]: entry() })[0].stockCost, undefined);
  const futures = { source: 'binance', account: 'U本位合约' }, fkey = assetMappingKey(futures, token);
  assert.equal(annotateBalances([token], futures, [{ key: fkey, symbol: 'NVDA' }], undefined, { [`balance:${fkey}`]: entry() })[0].stockCost, undefined);
});

test('missing valuations do not fabricate PnL; absent costs stay unknown', () => {
  const balance = annotateBalances([{ ...token, usdValue: 0, valuationIncomplete: true }], location, mark, undefined, { [id]: entry() })[0];
  assert.equal(balance.stockCost.costUsd, 200); assert.equal(balance.stockCost.pnlUsd, null); assert.equal(balance.stockCost.pnlPct, null);
  const snapshot = buildSnapshot({ wallet: '0x123', okx: { balances: [balance] }, portfolio: { totalUsd: 0 } });
  assert.equal(snapshot.positions[0].priceLocal, undefined);
  assert.equal(snapshotToAiJson(snapshot).venues.okx.stocks[0].pnlPct, undefined);
  assert.equal(valueManualStockCost(entry(), 'NVDA', undefined, 300), undefined);
  assert.equal(valueManualStockCost(entry(), 'AMD', 2, 300), undefined);
  assert.equal(valueManualStockCost(entry(), 'NVDA', -2, 300), undefined);
});

test('AI merges manual costs and PnL with brokers, weighting costs by explicit stock equivalents while preserving token quantities', () => {
  const holdings = mappedStockHoldings({ okx: mapped(entry()) });
  const [only] = deriveTargets([target], undefined, gate, quote, {}, holdings);
  assert.equal(only.costBasisLocal, 100); assert.equal(only.pnlUsd, 100); assert.equal(only.pnlPct, 50); assert.equal(only.livePrice, 210);
  assert.equal(only.quantities[0].unit, '枚'); assert.equal(only.quantities[0].amount, 2);
  const stocks = { brokers: [{ positions: [{ id: 'ibkr', market: 'US', symbol: 'NVDA', kind: 'stock', shares: 2, costBasis: 200, price: 210, marketValueUsd: 420, pnlUsd: 20 }] }] };
  const [combined] = deriveTargets([target], stocks, gate, quote, {}, holdings);
  assert.equal(combined.currentValue, 720); assert.equal(combined.pnlUsd, 120); assert.equal(combined.pnlPct, 20); assert.equal(combined.costBasisLocal, 150);
  const converted = mappedStockHoldings({ okx: mapped(entry({ sharesPerUnit: 2 })) });
  assert.equal(deriveTargets([target], stocks, gate, quote, {}, converted)[0].costBasisLocal, 100);
  const partial = [...holdings, { ...holdings[0], stockCost: undefined }];
  assert.equal(deriveTargets([target], stocks, gate, quote, {}, partial)[0].pnlUsd, null);
  assert.equal(deriveTargets([target], stocks, gate, quote, {}, partial)[0].costBasisLocal, null);
});

test('DeFi costs use explicitly entered share quantities and reach AI/snapshots exactly once', () => {
  const protocol = { platformId: 'pendle', platformName: 'Pendle', network: 'Ethereum', chainId: '1', totalUsdValue: 400, positions: [{ type: 'other', totalUsdValue: 400, tokens: [{ symbol: 'PT-NVDA', amount: 700, usdValue: 400 }] }] };
  const wallet = { walletId: 'w1', walletName: 'Wallet', address: '0x123456789', chains: ['ethereum'], balances: [], totalUsdValue: 400, defiPositions: [protocol] };
  const did = defiCategoryKey('w1', 'pendle', '1');
  const rows = annotateWallets([wallet], [], () => 'NVDA', { [did]: entry({ quantity: 3 }) });
  const cost = rows[0].defiPositions[0].stockCost;
  assert.equal(cost.costUsd, 300); assert.equal(cost.underlyingShares, 3); assert.equal(cost.pnlUsd, 100);
  const [ai] = deriveTargets([target], undefined, gate, quote, {}, mappedStockHoldings({ onchain: rows }));
  assert.equal(ai.currentValue, 400); assert.equal(ai.costBasisLocal, 100); assert.equal(ai.pnlUsd, 100);
  assert.equal(ai.quantities[0].amount, 700); assert.equal(ai.quantities[0].unit, '枚');
  const snapshot = buildSnapshot({ wallet: '0x123', onchain: rows, portfolio: { totalUsd: 400 } });
  assert.equal(snapshot.positions.length, 1); assert.equal(snapshot.positions[0].qty, 3); assert.equal(snapshot.positions[0].valueUsd, 400); assert.equal(snapshot.positions[0].costSource, 'manual');
  assert.equal(annotateWallets(rows, [], () => 'NVDA')[0].defiPositions[0].stockCost, undefined);
});

test('manual costs and original units persist in exports and change snapshot fingerprints without changing market totals', () => {
  const snapshot = buildSnapshot({ wallet: '0x123', okx: mapped(entry({ sharesPerUnit: 2 })), portfolio: { totalUsd: 300 } });
  const position = snapshot.positions[0];
  assert.equal(position.qty, 2); assert.equal(position.entryPrice, 100); assert.equal(position.costUsd, 200); assert.equal(position.pnlUsd, 100); assert.equal(position.underlyingShares, 4); assert.equal(position.quantityUnit, 'token');
  const exported = snapshotToAiJson(snapshot).venues.okx.stocks[0];
  assert.equal(exported.costSource, 'manual'); assert.equal(exported.costUsd, 200); assert.equal(exported.underlyingShares, 4);
  assert.match(snapshotToMarkdown(snapshot), /手动买入价/);
  const changed = buildSnapshot({ wallet: '0x123', okx: mapped(entry({ buyPriceUsd: 90 })), portfolio: { totalUsd: 300 } });
  assert.notEqual(snapshotFingerprint(snapshot), snapshotFingerprint(changed));
});

test('manual cost store reloads and clears per-location prices, validating writes atomically', () => {
  const originalWindow = global.window, originalStorage = global.localStorage, values = new Map();
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };global.window = { localStorage: global.localStorage };
  try {
    const fresh = () => createTsLoader()('stores/manualStockCostStore.ts').useManualStockCostStore;
    const store = fresh();store.getState().setCost(id, entry());store.getState().setCost('other', entry({ buyPriceUsd: 120 }));
    assert.equal(fresh().getState().costs[id].buyPriceUsd, 100);
    assert.throws(() => store.getState().setCost(id, entry({ buyPriceUsd: -1 })));
    assert.equal(fresh().getState().costs[id].buyPriceUsd, 100);
    store.getState().removeCost(id);
    assert.equal(fresh().getState().costs[id], undefined);assert.equal(fresh().getState().costs.other.buyPriceUsd, 120);
  } finally { global.window = originalWindow;global.localStorage = originalStorage; }
});
