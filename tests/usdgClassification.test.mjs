import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const modules = new Map();

// Exercise the real TS entry points without adding a separate test runtime.
function loadTs(filename) {
  if (modules.has(filename)) return modules.get(filename).exports;
  const loaded = new Module(filename);
  modules.set(filename, loaded);
  loaded.require = (specifier) => {
    if (specifier.startsWith('@/')) {
      return loadTs(path.join(sourceRoot, `${specifier.slice(2)}.ts`));
    }
    if (specifier.startsWith('.')) {
      return loadTs(path.resolve(path.dirname(filename), `${specifier}.ts`));
    }
    return Module.createRequire(filename)(specifier);
  };
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}

const { classifyBinance, classifyOkx, classifyOnchain } = loadTs(path.join(sourceRoot, 'lib/portfolio/category.ts'));
const { buildEconomicAllocationInput, applyEconomicAnalysis } = loadTs(path.join(sourceRoot, 'lib/ai/portfolioAllocation.ts'));
const { buildPositionBreakdown } = loadTs(path.join(sourceRoot, 'lib/portfolio/positions.ts'));
const { buildSnapshot } = loadTs(path.join(sourceRoot, 'lib/portfolio/snapshot.ts'));
const { snapshotToAiJson } = loadTs(path.join(sourceRoot, 'lib/snapshot/export.ts'));

function holdings(asset = 'USDG') {
  const balances = [
    { asset, amount: 1000, usdValue: 1000 },
    { asset: 'BTC', amount: 0.01, usdValue: 500 },
  ];
  return {
    binance: { accounts: [{ label: '现货', balances, totalUsdValue: 1500 }] },
    okx: { balances },
    onchain: [{
      walletId: 'wallet-1', walletName: 'Wallet', address: '0x1234567890',
      chains: ['solana'], balances, totalUsdValue: 1500,
    }],
  };
}

test('USDG balances count as cash across exchanges and onchain wallets', () => {
  for (const symbol of ['USDG', 'usdg', 'LDUSDG']) {
    const data = holdings(symbol);
    for (const split of [classifyBinance(data.binance), classifyOkx(data.okx), classifyOnchain(data.onchain)]) {
      assert.deepEqual(split, { cash: 1000, crypto: 500 }, symbol);
    }
  }
});

test('economic analysis includes USDG in cash, preserving totals and BTC exposure', () => {
  const data = holdings();
  const splits = [classifyBinance(data.binance), classifyOkx(data.okx), classifyOnchain(data.onchain)];
  const input = buildEconomicAllocationInput({
    ...data,
    totalValue: 4500,
    categoryBreakdown: [
      { label: '现金', value: splits.reduce((sum, split) => sum + split.cash, 0) },
      { label: '加密', value: splits.reduce((sum, split) => sum + split.crypto, 0) },
    ],
    bankCash: [], customAssets: [],
  });
  for (const candidate of input.candidates) {
    assert.equal(candidate.baseCategory, candidate.label.startsWith('USDG') ? '类现金' : '加密资产');
  }
  const result = applyEconomicAnalysis(input, { summary: '', classifications: [] });
  assert.equal(result.find((bucket) => bucket.label === '类现金').value, 3000);
  assert.equal(result.find((bucket) => bucket.label === '加密资产').value, 1500);
  assert.equal(result.reduce((sum, bucket) => sum + bucket.value, 0), 4500);
  assert.equal(result.find((bucket) => bucket.label === '类现金').details.length, 3);
});

test('USDG used as Binance futures margin retains its account-based classification', () => {
  const binance = { accounts: [{ label: 'U本位合约', balances: [{ asset: 'USDG', usdValue: 1000 }], totalUsdValue: 1000 }] };
  assert.deepEqual(classifyBinance(binance), { cash: 0, crypto: 1000 });
  const input = buildEconomicAllocationInput({ binance, totalValue: 1000, categoryBreakdown: [{ label: '加密', value: 1000 }], bankCash: [], customAssets: [] });
  assert.equal(input.candidates[0].baseCategory, '加密资产');
});

test('USDG is excluded from crypto spot exposure and AI snapshot export', () => {
  const data = holdings();
  const exposure = buildPositionBreakdown(data);
  assert.equal(exposure.find((bucket) => bucket.label === '加密现货').value, 1500);
  const snapshot = buildSnapshot({
    ...data, wallet: '0x1234567890',
    portfolio: { totalUsd: 4500, cashUsd: 3000, cryptoUsd: 1500, stocksUsd: 0, otherUsd: 0 },
  });
  for (const position of snapshot.positions.filter((row) => row.symbol === 'USDG' && row.source !== 'onchain')) {
    assert.equal(position.kind, 'cash');
  }
  // Older snapshots may still carry the incorrect crypto kind.
  for (const row of snapshot.positions.filter((position) => position.symbol === 'USDG')) row.kind = 'crypto';
  const exported = snapshotToAiJson(snapshot);
  assert.equal(exported.summary.byCategory.cryptoSpotUsd, 1500);
  for (const venue of Object.values(exported.venues)) {
    assert.deepEqual(venue.spotNonStable.map((row) => row.symbol), ['BTC']);
  }
});
