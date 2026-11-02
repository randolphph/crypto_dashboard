import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const guards = { enforceRateLimit: async () => null };

test('OKX filters below $1 after merging the same currency, preserving $1 and $1–$10 holdings', async () => {
  const load = createTsLoader({
    '@/lib/exchanges/okx': { fetchOkxBalances: async () => ({ balances: [
      { asset: 'DUST', amount: 1, usdValue: .99 },
      { asset: 'MERGED', amount: .4, usdValue: .4 },
      { asset: 'MERGED', amount: .6, usdValue: .6 },
      { asset: 'SMALL', amount: 5, usdValue: 5 },
    ], errors: [] }) },
    '@/lib/prices': { fetchPrices: async () => assert.fail('already valued') },
    '@/lib/http/guards': guards,
  });
  const response = await load('app/api/exchanges/okx/route.ts').GET(new Request('http://localhost/api/exchanges/okx', {
    headers: { 'x-okx-api-key': 'key', 'x-okx-api-secret': 'secret', 'x-okx-passphrase': 'passphrase' },
  }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.balances.map(b => [b.asset, b.usdValue]), [['MERGED', 1], ['SMALL', 5]]);
  assert.equal(data.totalUsdValue, 6);
  assert.deepEqual(data.dataQuality, { complete: true, errors: [] });
});

test('Deribit hides currency dust while preserving negative margin, option positions and authoritative net equity', async () => {
  const positions = [{ instrument_name: 'BTC-25DEC26-100000-C', size: 1, mark_price: .000001 }];
  const load = createTsLoader({
    '@/lib/exchanges/deribit': { fetchDeribitData: async () => ({ positions, errors: [], accountSummaries: [
      { currency: 'USDT', margin_balance: .99, total_equity_usd: 100 },
      { currency: 'USDC', margin_balance: 1, total_equity_usd: 100 },
      { currency: 'BTC', margin_balance: -.00002, total_equity_usd: 100 },
    ] }) },
    '@/lib/prices': { fetchPrices: async () => ({ BTC: 100000 }) },
    '@/lib/http/guards': guards,
  });
  const response = await load('app/api/exchanges/deribit/route.ts').GET(new Request('http://localhost/api/exchanges/deribit', {
    headers: { 'x-deribit-client-id': 'id', 'x-deribit-client-secret': 'secret' },
  }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(data.balances.map(b => [b.asset, b.usdValue]), [['USDC', 1], ['BTC', -2]]);
  assert.equal(data.totalUsdValue, 100);
  assert.deepEqual(data.positions, positions);
});

test('onchain balances retain the same $1 boundary as exchanges', async () => {
  const load = createTsLoader({
    'server-only': {},
    './okxWeb3': {
      isOkxWeb3Available: () => true,
      fetchBalancesViaOkx: async () => [
        { asset: 'DUST', chainId: '1', amount: 100, usdValue: .99 },
        { asset: 'SMALL', chainId: '1', amount: 1, usdValue: 1 },
      ],
      fetchDefiPositionsViaOkx: async () => ({ positions: [], lpTokenKeys: new Set(), positionTokenAmounts: new Map() }),
    },
    './hyperliquid': { fetchHyperliquidWalletBalances: async () => [] },
  });
  const data = await load('lib/onchain/wallet.ts').fetchCompleteWallet({ id: 'qa', name: 'QA', address: '0xabc', chains: ['ethereum'] }, [], {});
  assert.deepEqual(data.balances.map(b => b.asset), ['SMALL']);
  assert.equal(data.totalUsdValue, 1);
});
