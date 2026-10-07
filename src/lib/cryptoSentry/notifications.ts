import type { BarkIntegrationInput, CryptoSentryIntegration, NotificationIntegration } from '@/types/cryptoSentry';

export function isNotificationIntegration(value: CryptoSentryIntegration): value is NotificationIntegration {
  return value.type === 'notification' && (value.provider === 'telegram' || value.provider === 'bark');
}

export function notificationProviderLabel(provider: string): string {
  return provider === 'bark' ? 'Bark' : provider === 'telegram' ? 'Telegram' : provider;
}

export function buildBarkConfig(input: Omit<BarkIntegrationInput, 'name'>, editing = false) {
  let serverUrl = input.serverUrl.trim();
  let deviceKey = input.deviceKey.trim();
  if (/^https?:\/\//i.test(deviceKey)) {
    const pushUrl = new URL(deviceKey);
    const segments = pushUrl.pathname.split('/').filter(Boolean);
    if (pushUrl.username || pushUrl.password || !segments[0] || segments[0] === 'push') throw new Error('请粘贴包含 Device Key 的 Bark 推送地址');
    if (pushUrl.hostname !== 'api.day.app' && segments.length > 1) throw new Error('自建服务带路径时，请分别填写服务器地址和 Device Key');
    serverUrl = pushUrl.origin;
    deviceKey = decodeURIComponent(segments[0]);
  }
  let url: URL;
  try { url = new URL(serverUrl); }
  catch { throw new Error('请输入有效的 Bark 服务器地址'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('服务器地址需为 HTTP/HTTPS 地址，且不含账号、查询参数或片段');
  if ((!editing || deviceKey) && !/^[A-Za-z0-9_-]{1,512}$/.test(deviceKey)) throw new Error('请输入有效的 Device Key');
  if (input.group.trim().length > 100) throw new Error('通知分组不能超过 100 个字符');
  return { serverUrl: url.toString().replace(/\/+$/, ''), group: input.group.trim(),
    ...(deviceKey ? { deviceKey } : {}) };
}
