import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import ts from 'typescript';

// Compile the pure TS matcher with the project's existing compiler; no test
// runtime or server-only module mocks are needed.
const filename = fileURLToPath(new URL('../src/lib/onchain/aaveReceipts.ts', import.meta.url));
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const matcherModule = new Module(filename);
matcherModule._compile(compiled.outputText, filename);
const { isAaveReceiptBalance } = matcherModule.exports;

function balance(asset = 'aPlaUSDT0', chainId = '9745', amount = 1000) {
  return { asset, chainId, amount, usdValue: amount };
}

test('aTokens never contribute to wallet assets, without any DeFi position', () => {
  const balances = [balance(), balance('USDT0', '9745', 100)];
  const walletUsd = balances.filter((item) => !isAaveReceiptBalance(item)).reduce((sum, item) => sum + item.usdValue, 0);
  assert.equal(walletUsd, 100);
});

test('exclusion is independent of amount or accrued interest', () => {
  for (const amount of [0, 1000, 1500, 39999.987999]) {
    assert.equal(isAaveReceiptBalance(balance('aPlaUSDT0(Plasma)', '9745', amount)), true);
  }
});

test('numeric and string chain identifiers recognize the same aToken', () => {
  for (const chainId of ['9745', 9745]) assert.equal(isAaveReceiptBalance(balance('aPlaUSDT0(Plasma)', chainId)), true);
});

test('ordinary underlying assets and AAVE remain included', () => {
  for (const asset of ['USDT0', 'sUSDe', 'USDe', 'WETH', 'AAVE', 'apple']) {
    for (const chainId of ['1', '9745']) assert.equal(isAaveReceiptBalance(balance(asset, chainId)), false, asset);
  }
});

test('supported Aave V2/V3 market prefixes include lowercase underlying symbols', () => {
  for (const [chainId, receipt] of [
    ['1', 'aUSDT'], ['1', 'aSTETH'], ['1', 'aEthUSDC'],
    ['1', 'aEthLidowstETH'], ['1', 'aEthEtherFiweETH'],
    ['10', 'aOptUSDT'], ['42161', 'aArbUSDC'],
    ['8453', 'aBascbETH'], ['56', 'aBnbUSDT'],
    ['9745', 'aPlasUSDe'], ['9745', 'aPlaweETH'],
    ['9745', 'aPlaPT_sUSDE_22OCT2026'],
  ]) assert.equal(isAaveReceiptBalance(balance(receipt, chainId)), true, receipt);
});

test('wrong-chain prefixes, empty symbols and unrelated tokens remain included', () => {
  for (const [asset, chainId] of [
    ['aEthUSDT', '9745'], ['aPlaUSDT0', '1'], ['aFakeUSDT0', '9745'],
    ['aFakeUSDT0', '1'], ['aPla', '9745'], ['', '9745'], ['aPlaUSDT0', undefined],
  ]) {
    assert.equal(isAaveReceiptBalance({ asset, chainId }), false, asset);
  }
});
