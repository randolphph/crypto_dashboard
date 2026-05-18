import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

interface ApiKeyState extends ApiKeys {
  setKeys: (partial: Partial<ApiKeys>) => void;
  clearAll: () => void;
  getHeaders: () => Record<string, string>;
}

const emptyKeys: ApiKeys = {
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
};

export const useApiKeyStore = create<ApiKeyState>()(
  persist(
    (set, get) => ({
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
        return h;
      },
    }),
    { name: 'crypto-dashboard-api-keys' }
  )
);
