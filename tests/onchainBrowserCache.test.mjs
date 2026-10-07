import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const load = createTsLoader();
const { browserSourceScope, browserWalletKey, restoreBrowserWallet, mergeWalletResults } = load('lib/onchain/browserCache.ts');
const { ONCHAIN_BROWSER_RETENTION_MS, hasOnchainWarning } = load('lib/onchain/cachePolicy.ts');
const config = { id: 'w', name: 'Wallet', address: '0xAbC', chains: ['ethereum'] };
const data = (amount, timestamp) => ({ walletId: 'w', walletName: 'Wallet', address: config.address,
  chains: config.chains, balances: [], totalUsdValue: amount, dataUpdatedAt: timestamp,
  dataQuality: { complete: true, errors: [] } });

test('browser caches are partitioned by login wallet and credential fingerprint', async () => {
  const a = await browserSourceScope('0xOwner', ['key', 'secret']);
  assert.equal(a, await browserSourceScope('0xowner', ['key', 'secret']));
  assert.notEqual(a, await browserSourceScope('0xOther', ['key', 'secret']));
  assert.notEqual(a, await browserSourceScope('0xOwner', ['other', 'secret']));
  const key = browserWalletKey(a, config, []);
  assert.equal(key, browserWalletKey(a, { ...config, name: 'Renamed', address: '0xabc' }, []));
  assert.notEqual(key, browserWalletKey(a, config, [{ chainId: '1', tokenAddress: '0xReceipt' }]));
  assert.ok(!key.includes('secret'));
});

test('restore keeps original collection time and expires thirty days after successful collection', () => {
  const timestamp = 100000;
  const row = { data: data(100, timestamp), expiresAt: timestamp + ONCHAIN_BROWSER_RETENTION_MS };
  const restored = restoreBrowserWallet(row, { ...config, name: 'Renamed' }, timestamp + 1000);
  assert.equal(restored.walletName, 'Renamed');
  assert.equal(restored.dataUpdatedAt, timestamp);
  assert.equal(restored.cache.source, 'browser');
  assert.equal(restoreBrowserWallet(row, config, row.expiresAt), null);
});

test('failed wallet results preserve browser assets and timestamp while other wallets update', () => {
  const now = Date.now();
  const previous = [data(100, now - 1000)];
  const result = mergeWalletResults([
    { ...data(0, undefined), error: 'OKX unavailable', dataQuality: { complete: false, errors: ['unavailable'] } },
    { ...data(200, now), walletId: 'other' },
  ], previous);
  assert.equal(result[0].totalUsdValue, 100);
  assert.equal(result[0].dataUpdatedAt, previous[0].dataUpdatedAt);
  assert.equal(result[0].cache.refreshError, 'OKX unavailable');
  assert.equal(result[1].totalUsdValue, 200);
});

test('new successful zero balances supersede old balances, but delayed old responses do not', () => {
  const now = Date.now();
  assert.equal(mergeWalletResults([data(0, now)], [data(100, now - 1000)])[0].totalUsdValue, 0);
  assert.equal(mergeWalletResults([data(200, now - 1000)], [data(100, now)])[0].totalUsdValue, 100);
});

test('expired browser data is not revived on network failure', () => {
  const now = Date.now();
  const failed = { ...data(0, undefined), error: 'network error' };
  const result = mergeWalletResults([failed], [data(100, now - ONCHAIN_BROWSER_RETENTION_MS)]);
  assert.equal(result[0].error, 'network error');
  assert.equal(result[0].totalUsdValue, 0);
});

test('old or failed cached data is flagged for snapshot quality', () => {
  const now = Date.now();
  assert.equal(hasOnchainWarning(data(100, now - 10 * 60 * 1000), now), false);
  assert.equal(hasOnchainWarning(data(100, now - 2 * 60 * 60 * 1000), now), true);
  assert.equal(hasOnchainWarning({ ...data(100, now), cache: { refreshError: 'timeout' } }, now), true);
});
