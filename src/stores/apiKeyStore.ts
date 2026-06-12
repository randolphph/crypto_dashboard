import { create } from 'zustand';

export interface ApiKeys {
  // Binance
  binanceApiKey: string;
  binanceApiSecret: string;
  binanceEnableGridBot: boolean;
  // OKX
  okxApiKey: string;
  okxApiSecret: string;
  okxPassphrase: string;
  // Deribit
  deribitClientId: string;
  deribitClientSecret: string;
  // OKX Web3
  okxWeb3ApiKey: string;
  okxWeb3ApiSecret: string;
  okxWeb3Passphrase: string;
  okxWeb3ProjectId: string;
  // LongPort
  longportAppKey: string;
  longportAppSecret: string;
  longportAccessToken: string;
  // IBKR Flex Query
  ibkrFlexToken: string;
  ibkrFlexQueryId: string;
  // DeepSeek (AI chat)
  deepseekApiKey: string;
}

interface ApiKeyState extends ApiKeys {
  setKeys: (partial: Partial<ApiKeys>) => void;
  clearAll: () => void;
  getHeaders: () => Record<string, string>;
}

export const emptyKeys: ApiKeys = {
  binanceApiKey: '',
  binanceApiSecret: '',
  binanceEnableGridBot: false,
  okxApiKey: '',
  okxApiSecret: '',
  okxPassphrase: '',
  deribitClientId: '',
  deribitClientSecret: '',
  okxWeb3ApiKey: '',
  okxWeb3ApiSecret: '',
  okxWeb3Passphrase: '',
  okxWeb3ProjectId: '',
  longportAppKey: '',
  longportAppSecret: '',
  longportAccessToken: '',
  ibkrFlexToken: '',
  ibkrFlexQueryId: '',
  deepseekApiKey: '',
};

export const API_KEY_FIELDS = Object.keys(emptyKeys) as (keyof ApiKeys)[];

export function extractApiKeys(state: ApiKeys): ApiKeys {
  const out = { ...emptyKeys };
  for (const k of API_KEY_FIELDS) {
    (out as Record<string, unknown>)[k] = state[k];
  }
  return out;
}

export const useApiKeyStore = create<ApiKeyState>((set, get) => ({
  ...emptyKeys,
  setKeys: (partial) => set(partial),
  clearAll: () => set(emptyKeys),
  getHeaders: () => {
    const s = get();
    const h: Record<string, string> = {};
    if (s.binanceApiKey) h['x-binance-api-key'] = s.binanceApiKey;
    if (s.binanceApiSecret) h['x-binance-api-secret'] = s.binanceApiSecret;
    if (s.binanceEnableGridBot) h['x-binance-enable-grid-bot'] = 'true';
    if (s.okxApiKey) h['x-okx-api-key'] = s.okxApiKey;
    if (s.okxApiSecret) h['x-okx-api-secret'] = s.okxApiSecret;
    if (s.okxPassphrase) h['x-okx-passphrase'] = s.okxPassphrase;
    if (s.deribitClientId) h['x-deribit-client-id'] = s.deribitClientId;
    if (s.deribitClientSecret) h['x-deribit-client-secret'] = s.deribitClientSecret;
    if (s.okxWeb3ApiKey) h['x-okx-web3-api-key'] = s.okxWeb3ApiKey;
    if (s.okxWeb3ApiSecret) h['x-okx-web3-api-secret'] = s.okxWeb3ApiSecret;
    if (s.okxWeb3Passphrase) h['x-okx-web3-passphrase'] = s.okxWeb3Passphrase;
    if (s.okxWeb3ProjectId) h['x-okx-web3-project-id'] = s.okxWeb3ProjectId;
    if (s.longportAppKey) h['x-longport-app-key'] = s.longportAppKey;
    if (s.longportAppSecret) h['x-longport-app-secret'] = s.longportAppSecret;
    if (s.longportAccessToken) h['x-longport-access-token'] = s.longportAccessToken;
    if (s.ibkrFlexToken) h['x-ibkr-flex-token'] = s.ibkrFlexToken;
    if (s.ibkrFlexQueryId) h['x-ibkr-flex-query-id'] = s.ibkrFlexQueryId;
    return h;
  },
}));
