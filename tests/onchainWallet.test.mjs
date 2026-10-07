import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const wallet = { id: 'w', name: 'Wallet', address: '0xabc', chains: ['ethereum'] };
function client({ balances = [], defiError, detailError } = {}) {
  const load = createTsLoader({
    'server-only': {},
    '@/lib/onchain/okxWeb3': {},
  });
  // Resolver calls and dedup rules run unchanged; only upstream transport is replaced.
  const custom = createTsLoader({
    'server-only': {},
    './okxWeb3': {
      isOkxWeb3Available: () => true,
      lpKey: (chain, address) => `${chain}:${address.toLowerCase()}`,
      fetchBalancesViaOkx: async () => balances,
      fetchDefiPositionsViaOkx: async () => {
        if (defiError || detailError) throw new Error(defiError || detailError);
        return { positions: [], lpTokenKeys: new Set(), positionTokenAmounts: new Map() };
      },
    },
    './hyperliquid': { fetchHyperliquidWalletBalances: async () => [] },
    './aaveReceipts': load('lib/onchain/aaveReceipts.ts'),
  });
  return custom('lib/onchain/wallet.ts');
}

test('complete wallet results keep Aave receipts excluded and manual filters consistent', async () => {
  const { fetchCompleteWallet } = client({ balances: [
    { asset: 'aEthUSDC', chainId: '1', amount: 100, usdValue: 100 },
    { asset: 'USDC', chainId: '1', amount: 20, usdValue: 20 },
    { asset: 'LP', chainId: '1', tokenAddress: '0xReceipt', amount: 10, usdValue: 10 },
  ] });
  const result = await fetchCompleteWallet(wallet, [{ chainId: '1', tokenAddress: '0xreceipt' }], {});
  assert.equal(result.totalUsdValue, 20);
  assert.equal(result.balances[0].dedupedToDefi, true);
  assert.equal(result.balances[2].dedupedToDefi, true);
  assert.equal(result.dataQuality.complete, true);
});

test('failed DeFi collection cannot become a successful empty wallet', async () => {
  const { fetchCompleteWallet } = client({ defiError: 'DeFi detail timed out' });
  const result = await fetchCompleteWallet(wallet, [], {});
  assert.match(result.error, /DeFi detail timed out/);
  assert.notEqual(result.dataQuality?.complete, true);
});

test('OKX DeFi detail errors reject the whole collection rather than silently removing positions', async () => {
  const load = createTsLoader({
    'server-only': {},
    'node:timers/promises': { setTimeout: async () => undefined },
    '@/lib/http/fetch': { fetchWithTimeout: async (url) => Response.json(url.includes('/platform/list')
      ? { code: '0', data: { walletIdPlatformList: [{ platformList: [{ platformName: 'Aave', analysisPlatformId: 1, currencyAmount: '100' }] }] } }
      : { code: '50000', msg: 'detail unavailable' }) },
  });
  const { fetchDefiPositionsViaOkx } = load('lib/onchain/okxWeb3.ts');
  await assert.rejects(fetchDefiPositionsViaOkx('0xabc', ['ethereum'], { apiKey: 'key', apiSecret: 'secret', passphrase: 'pass', projectId: 'project' }), /detail unavailable/);
});
