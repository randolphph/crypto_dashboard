import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTsLoader } from './helpers/loadTs.mjs';

const requests = [];
const invalidations = [];
const load = createTsLoader({
  '@tanstack/react-query': {
    useQuery: (options) => options,
    useMutation: (options) => options,
    useQueryClient: () => ({ invalidateQueries: (options) => invalidations.push(options) }),
  },
  '@/lib/cryptoSentry/client': { cryptoSentryRequest: async (path, options) => { requests.push({ path, ...options }); return {}; } },
});
const { buildBarkConfig, isNotificationIntegration } = load('lib/cryptoSentry/notifications.ts');
const hooks = load('hooks/useCryptoSentry.ts');

test('Bark accepts an app example URL and keeps the key out of the server address', () => {
  assert.deepEqual(buildBarkConfig({ serverUrl: 'https://api.day.app', deviceKey: 'https://api.day.app/sample-device/推送标题/推送内容?group=test', group: ' CryptoSentry ' }),
    { serverUrl: 'https://api.day.app', deviceKey: 'sample-device', group: 'CryptoSentry' });
});

test('self-hosted Bark supports server paths and editing preserves an omitted key', () => {
  assert.deepEqual(buildBarkConfig({ serverUrl: 'https://push.example/bark/', deviceKey: '', group: '' }, true),
    { serverUrl: 'https://push.example/bark', group: '' });
  assert.deepEqual(buildBarkConfig({ serverUrl: 'https://push.example/bark/', deviceKey: 'device_key-1', group: 'alerts' }),
    { serverUrl: 'https://push.example/bark', deviceKey: 'device_key-1', group: 'alerts' });
});

test('invalid Bark addresses and keys fail before saving', () => {
  for (const serverUrl of ['not a url', 'file:///tmp/key', 'https://user:secret@push.example', 'https://push.example?key=secret']) {
    assert.throws(() => buildBarkConfig({ serverUrl, deviceKey: 'valid-key', group: '' }));
  }
  for (const deviceKey of ['', '********', 'bad/key', 'https://api.day.app/push']) {
    assert.throws(() => buildBarkConfig({ serverUrl: 'https://api.day.app', deviceKey, group: '' }));
  }
});

test('notification targets include Telegram and Bark while excluding data sources', () => {
  const rows = [{ id: 'tg', type: 'notification', provider: 'telegram' }, { id: 'bark', type: 'notification', provider: 'bark' },
    { id: 'rpc', type: 'evm_rpc', provider: 'custom' }, { id: 'wrong', type: 'market_data', provider: 'bark' }];
  assert.deepEqual(rows.filter(isNotificationIntegration).map((row) => row.id), ['tg', 'bark']);
  assert.deepEqual(hooks.useNotificationIntegrations().select({ items: rows }).map((row) => row.id), ['tg', 'bark']);
});

test('Bark create, edit and test use the existing backend endpoints without returning a masked key', async () => {
  const create = hooks.useCreateBarkIntegration();
  await create.mutationFn({ name: 'Phone', serverUrl: 'https://api.day.app', deviceKey: 'test-device', group: 'alerts' });
  assert.deepEqual(JSON.parse(requests.at(-1).body), { name: 'Phone', type: 'notification', provider: 'bark', enabled: true,
    config: { serverUrl: 'https://api.day.app', deviceKey: 'test-device', group: 'alerts' } });
  create.onSuccess();
  assert.deepEqual(invalidations.at(-1).queryKey, ['crypto-sentry', 'integrations']);
  const update = hooks.useUpdateBarkIntegration();
  await update.mutationFn({ id: 'phone', name: 'Renamed', serverUrl: 'https://push.example', group: '' });
  assert.equal(requests.at(-1).path, 'integrations/phone');
  assert.equal(requests.at(-1).method, 'PATCH');
  assert.deepEqual(JSON.parse(requests.at(-1).body).config, { serverUrl: 'https://push.example', group: '' });
  await hooks.useTestNotificationIntegration().mutationFn('phone');
  assert.equal(requests.at(-1).path, 'integrations/phone/test');
  assert.equal(requests.at(-1).method, 'POST');
});
