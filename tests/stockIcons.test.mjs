import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createTsLoader } from './helpers/loadTs.mjs';

const { bundledStockIconUrl, stockIconUrl } = createTsLoader()('lib/portfolio/stockIcons.ts');

test('China Merchants Bank shares use a bundled official icon without crossing market identities', () => {
  const src = stockIconUrl('A', '600036');
  assert.match(src, /^\/stock-icons\/china-merchants-bank-/);
  assert.ok(existsSync(new URL(`../public${src}`, import.meta.url)));
  for (const symbol of ['600036.SH', '600036.SS', 'sh600036']) assert.equal(stockIconUrl('A', symbol), src);
  for (const symbol of ['3968', '03968', '03968.HK']) assert.equal(stockIconUrl('HK', symbol), src);
  assert.equal(bundledStockIconUrl('US', '600036'), null);
  assert.equal(bundledStockIconUrl('A', '6000369'), null);
  assert.equal(stockIconUrl('A', '600519'), '/api/stock-logo/A/600519');
});

test('legacy stock-logo URLs redirect to the official icon without fetching the incorrect upstream image', async () => {
  const calls = [];
  const { GET } = createTsLoader({ '@/lib/http/fetch': { fetchWithTimeout: async url => { calls.push(String(url)); throw new Error('must not fetch'); } } })('app/api/stock-logo/[market]/[symbol]/route.ts');
  const response = await GET(new Request('http://localhost/api/stock-logo/A/600036'), { params: Promise.resolve({ market: 'A', symbol: '600036' }) });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('Location'), bundledStockIconUrl('A', '600036'));
  assert.deepEqual(calls, []);
});
