import 'server-only';
import crypto from 'crypto';
import type { AssetBalance } from '@/types/common';

const BASE_URL = 'https://web3.okx.com';

import type { Chain, EvmChain } from '@/types/onchain';

// OKX Web3 API chainIndex mapping
const CHAIN_INDEX_MAP: Record<Chain, string> = {
  ethereum: '1',
  optimism: '10',
  arbitrum: '42161',
  base: '8453',
  bsc: '56',
  solana: '501',
  bitcoin: '0',
};

function sign(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secret: string
): string {
  const preSign = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', secret).update(preSign).digest('base64');
}

export interface OkxWeb3Creds {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  projectId?: string;
}

function getOkxWeb3Config(overrides?: OkxWeb3Creds) {
  const apiKey = overrides?.apiKey || process.env.OKX_WEB3_API_KEY;
  const apiSecret = overrides?.apiSecret || process.env.OKX_WEB3_API_SECRET;
  const passphrase = overrides?.passphrase || process.env.OKX_WEB3_PASSPHRASE;
  const projectId = overrides?.projectId || process.env.OKX_WEB3_PROJECT_ID;

  if (!apiKey || !apiSecret || !passphrase || !projectId) {
    return null;
  }

  return { apiKey, apiSecret, passphrase, projectId };
}

// Serial queue to avoid OKX rate limits
const REQUEST_INTERVAL_MS = 1000;
const MAX_RETRIES = 3;
let requestQueue: Promise<void> = Promise.resolve();

async function okxWeb3Request(path: string, overrides?: OkxWeb3Creds): Promise<unknown> {
  const config = getOkxWeb3Config(overrides);
  if (!config) {
    throw new Error('OKX Web3 API credentials not configured');
  }

  // Chain onto the queue so concurrent callers execute sequentially
  const result = new Promise<unknown>((resolve, reject) => {
    requestQueue = requestQueue
      .then(() => new Promise<void>((r) => setTimeout(r, REQUEST_INTERVAL_MS)))
      .then(async () => {
        try {
          resolve(await doFetch(path, config));
        } catch (e) {
          reject(e);
        }
      });
  });

  return result;
}

async function doFetch(
  path: string,
  config: { apiKey: string; apiSecret: string; passphrase: string; projectId: string },
  retries = 0
): Promise<unknown> {
  const timestamp = new Date().toISOString();
  const signature = sign(timestamp, 'GET', path, '', config.apiSecret);

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'OK-ACCESS-KEY': config.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': config.passphrase,
      'OK-ACCESS-PROJECT': config.projectId,
      'Content-Type': 'application/json',
    },
  });

  // Retry on 429
  if (res.status === 429 && retries < MAX_RETRIES) {
    const delay = REQUEST_INTERVAL_MS * (retries + 2);
    console.warn(`OKX 429, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, delay));
    return doFetch(path, config, retries + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OKX Web3 API error (${res.status}): ${text}`);
  }

  return res.json();
}

interface OkxTokenAsset {
  chainIndex: string;
  tokenAddress: string;
  symbol: string;
  balance: string;
  tokenPrice: string;
  tokenType: string;
  isRiskToken: boolean;
}

interface OkxAllTokenBalancesResponse {
  code: string;
  msg: string;
  data: Array<{
    tokenAssets: OkxTokenAsset[];
  }>;
}

export function isOkxWeb3Available(overrides?: OkxWeb3Creds): boolean {
  return getOkxWeb3Config(overrides) !== null;
}

// Reverse lookup: chainIndex -> chain label
const CHAIN_INDEX_LABEL: Record<string, string> = {
  '0': 'BTC',
  '1': 'ETH',
  '10': 'OP',
  '42161': 'ARB',
  '8453': 'Base',
  '56': 'BSC',
  '501': 'SOL',
};

export async function fetchBalancesViaOkx(
  address: string,
  chains: Chain[],
  overrides?: OkxWeb3Creds
): Promise<AssetBalance[]> {
  const chainIndexes = chains.map((c) => CHAIN_INDEX_MAP[c]).join(',');
  const path = `/api/v5/wallet/asset/all-token-balances-by-address?address=${address}&chains=${chainIndexes}&filter=0`;

  const data = (await okxWeb3Request(path, overrides)) as OkxAllTokenBalancesResponse;

  if (data.code !== '0') {
    throw new Error(`OKX Web3 API error: ${data.msg}`);
  }

  const allTokenAssets = (data.data ?? []).flatMap(
    (d) => d.tokenAssets ?? []
  );

  const multiChain = chains.length > 1;

  return allTokenAssets
    .filter((t) => !t.isRiskToken && parseFloat(t.balance) > 0)
    .map((t) => {
      const chainLabel = CHAIN_INDEX_LABEL[t.chainIndex] ?? t.chainIndex;
      return {
        asset: multiChain ? `${t.symbol}(${chainLabel})` : t.symbol,
        amount: parseFloat(t.balance),
        usdValue: parseFloat(t.balance) * parseFloat(t.tokenPrice || '0'),
      };
    });
}

export async function fetchEvmBalancesViaOkx(
  address: string,
  chains: EvmChain[],
  overrides?: OkxWeb3Creds
): Promise<AssetBalance[]> {
  return fetchBalancesViaOkx(address, chains, overrides);
}

export async function fetchSolanaBalancesViaOkx(
  address: string,
  overrides?: OkxWeb3Creds
): Promise<AssetBalance[]> {
  return fetchBalancesViaOkx(address, ['solana'], overrides);
}

export async function fetchBitcoinBalancesViaOkx(
  address: string,
  overrides?: OkxWeb3Creds
): Promise<AssetBalance[]> {
  return fetchBalancesViaOkx(address, ['bitcoin'], overrides);
}
