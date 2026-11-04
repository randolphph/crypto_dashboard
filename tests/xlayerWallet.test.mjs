import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const body = '1234567890abcdef1234567890abcdef12345678';
const evm = `0x${body}`, xko = `XKO${body}`;

test('XKO aliases normalize to the same EVM address and cache identity', () => {
  const load = createTsLoader();
  const { normalizeXLayerAddress } = load('lib/onchain/xlayerAddress.ts');
  const { normalizedWalletAddress } = load('lib/onchain/cachePolicy.ts');
  for (const prefix of ['XKO', 'xko', 'Xko']) {
    assert.equal(normalizeXLayerAddress(prefix + body), evm);
    assert.equal(normalizedWalletAddress(prefix + body), normalizedWalletAddress(evm));
  }
  assert.equal(normalizeXLayerAddress(' ' + evm + ' '), evm);
  for (const invalid of ['XKO0x' + body, 'XKO123', 'XKO' + 'g'.repeat(40)]) {
    assert.throws(() => normalizeXLayerAddress(invalid), /地址/);
  }
  assert.equal(normalizedWalletAddress('SolanaCaseSensitive'), 'SolanaCaseSensitive');
});

test('onchain request validation accepts X Layer and canonicalizes XKO before collection', () => {
  const load = createTsLoader({ 'server-only': {}, './guards': { RequestInputError: class extends Error {} } });
  const { parseOnchainBody } = load('lib/http/validation.ts');
  const data = parseOnchainBody({ wallets: [{ id: 'qa', name: 'OKX Pay', address: xko, chains: ['xlayer'] }] });
  assert.equal(data.wallets[0].address, evm);
  assert.deepEqual(data.wallets[0].chains, ['xlayer']);
  assert.throws(() => parseOnchainBody({ wallets: [{ id: 'qa', name: 'Pay', address: 'XKO123', chains: ['xlayer'] }] }), /地址/);
});

test('X Layer balances and DeFi query chain 196 using the EVM form of the Pay address', async () => {
  const calls = [];
  const load = createTsLoader({
    'server-only': {},
    'node:timers/promises': { setTimeout: async () => undefined },
    '@/lib/http/fetch': { fetchWithTimeout: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return Response.json(url.includes('/platform/list') ? { code: '0', data: { walletIdPlatformList: [] } }
        : { code: '0', data: [{ tokenAssets: [{ chainIndex: '196', tokenAddress: '0x1111111111111111111111111111111111111111', symbol: 'USDT', balance: '100', tokenPrice: '1', tokenType: '1', isRiskToken: false }] }] });
    } },
  });
  const { fetchBalancesViaOkx, fetchDefiPositionsViaOkx } = load('lib/onchain/okxWeb3.ts');
  const credentials = { apiKey: 'key', apiSecret: 'secret', passphrase: 'pass', projectId: 'project' };
  const balances = await fetchBalancesViaOkx(xko, ['xlayer'], credentials);
  assert.equal(calls[0].url.searchParams.get('address'), evm);
  assert.equal(calls[0].url.searchParams.get('chains'), '196');
  assert.equal(balances[0].asset, 'USDT');
  assert.equal(balances[0].usdValue, 100);
  await fetchDefiPositionsViaOkx(xko, ['xlayer'], credentials);
  assert.deepEqual(JSON.parse(calls[1].options.body).walletAddressList, [{ chainId: '196', walletAddress: evm }]);
  const multi = await fetchBalancesViaOkx(evm, ['ethereum', 'xlayer'], credentials);
  assert.equal(multi[0].asset, 'USDT(X Layer)');
});
