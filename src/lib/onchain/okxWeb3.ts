import 'server-only';
import crypto from 'crypto';
import { getAddress } from 'viem';
import type { AssetBalance } from '@/types/common';

const BASE_URL = 'https://web3.okx.com';

import type {
  Chain,
  EvmChain,
  DefiInvestType,
  DefiProtocolPosition,
  DefiPositionItem,
} from '@/types/onchain';

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

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

async function okxWeb3Request(
  path: string,
  options: RequestOptions = {},
  overrides?: OkxWeb3Creds
): Promise<unknown> {
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
          resolve(await doFetch(path, options, config));
        } catch (e) {
          reject(e);
        }
      });
  });

  return result;
}

async function doFetch(
  path: string,
  options: RequestOptions,
  config: { apiKey: string; apiSecret: string; passphrase: string; projectId: string },
  retries = 0
): Promise<unknown> {
  const method = options.method ?? 'GET';
  const bodyString = options.body !== undefined ? JSON.stringify(options.body) : '';
  const timestamp = new Date().toISOString();
  const signature = sign(timestamp, method, path, bodyString, config.apiSecret);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'OK-ACCESS-KEY': config.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': config.passphrase,
      'OK-ACCESS-PROJECT': config.projectId,
      'Content-Type': 'application/json',
    },
    body: bodyString || undefined,
  });

  // Retry on 429
  if (res.status === 429 && retries < MAX_RETRIES) {
    const delay = REQUEST_INTERVAL_MS * (retries + 2);
    console.warn(`OKX 429, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, delay));
    return doFetch(path, options, config, retries + 1);
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

// Trust Wallet's assets repo on GitHub serves token icons keyed by
// (chain, address). Free, no API key, but coverage is best for top tokens —
// long-tail tokens 404 and the UI falls back to a letter glyph.
const TRUSTWALLET_CHAIN_DIR: Record<string, string> = {
  '0': 'bitcoin',
  '1': 'ethereum',
  '10': 'optimism',
  '42161': 'arbitrum',
  '8453': 'base',
  '56': 'smartchain',
  '501': 'solana',
};

const TRUSTWALLET_BASE =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

function tokenLogoUrl(chainIndex: string, tokenAddress: string): string | undefined {
  const dir = TRUSTWALLET_CHAIN_DIR[chainIndex];
  if (!dir) return undefined;

  // Native token (no contract address) → use chain's info logo.
  if (
    !tokenAddress ||
    tokenAddress === '0x0000000000000000000000000000000000000000'
  ) {
    return `${TRUSTWALLET_BASE}/${dir}/info/logo.png`;
  }

  // Non-EVM (Solana, Bitcoin token IDs) keep address case as-is.
  if (dir === 'solana' || dir === 'bitcoin') {
    return `${TRUSTWALLET_BASE}/${dir}/assets/${tokenAddress}/logo.png`;
  }

  // Trust Wallet's GitHub paths are case-sensitive and use EIP-55 checksum.
  try {
    const checksummed = getAddress(tokenAddress as `0x${string}`);
    return `${TRUSTWALLET_BASE}/${dir}/assets/${checksummed}/logo.png`;
  } catch {
    return undefined;
  }
}

export async function fetchBalancesViaOkx(
  address: string,
  chains: Chain[],
  overrides?: OkxWeb3Creds
): Promise<AssetBalance[]> {
  const chainIndexes = chains.map((c) => CHAIN_INDEX_MAP[c]).join(',');
  const path = `/api/v5/wallet/asset/all-token-balances-by-address?address=${address}&chains=${chainIndexes}&filter=0`;

  const data = (await okxWeb3Request(path, {}, overrides)) as OkxAllTokenBalancesResponse;

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
        tokenAddress: t.tokenAddress,
        chainId: t.chainIndex,
        logo: tokenLogoUrl(t.chainIndex, t.tokenAddress),
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

// ----- DeFi positions -----

interface OkxDefiNetworkBalance {
  network: string;
  networkLogo: string;
  chainId: string;
  currencyAmount: string;
}

interface OkxDefiPlatform {
  platformName: string;
  analysisPlatformId: number;
  platformLogo: string;
  platformColor?: string;
  currencyAmount: string;
  isSupportInvest?: boolean;
  bonusTag?: number;
  platformUrl?: string;
  networkBalanceVoList?: OkxDefiNetworkBalance[];
  investmentCount?: string;
}

interface OkxDefiPlatformListResponse {
  code: number | string;
  msg?: string;
  data?: {
    walletIdPlatformList?: Array<{
      walletId: string;
      totalAssets: string;
      platformList?: OkxDefiPlatform[];
    }>;
    lpTokenAddressList?: Array<{ chainId: string; tokenAddress: string }>;
  };
}

interface OkxDefiAssetToken {
  tokenSymbol: string;
  tokenLogo?: string;
  coinAmount: string;
  currencyAmount: string;
  tokenPrecision?: string;
  tokenAddress?: string;
  network?: string;
}

interface OkxDefiInvestTokenBalance {
  investType: string;
  totalValue: string;
  assetsTokenList?: OkxDefiAssetToken[];
}

interface OkxDefiNetworkHold {
  network: string;
  chainId: string;
  investTokenBalanceVoList?: OkxDefiInvestTokenBalance[];
}

interface OkxDefiPlatformDetailResponse {
  code: number | string;
  msg?: string;
  data?: {
    walletIdPlatformDetailList?: Array<{
      networkHoldVoList?: OkxDefiNetworkHold[];
    }>;
    platformName?: string;
    analysisPlatformId?: string;
    platformLogo?: string;
    platformUrl?: string;
  };
}

const INVEST_TYPE_MAP: Record<string, DefiInvestType> = {
  '1': 'save',
  '2': 'pool',
  '3': 'farm',
  '4': 'vaults',
  '5': 'stake',
};

// LP-token-bearing protocols are surfaced by OKX so callers can de-dupe them
// against plain wallet balances. We key on `${chainId}:${tokenAddress.toLowerCase()}`.
function lpKey(chainId: string, tokenAddress: string): string {
  return `${chainId}:${tokenAddress.toLowerCase()}`;
}

// Minimum platform USD value before we bother fetching its detail breakdown.
const DEFI_MIN_USD = 1;

export interface DefiFetchResult {
  positions: DefiProtocolPosition[];
  // Token addresses OKX flags as LP/position-bearing — always filter from wallet.
  lpTokenKeys: Set<string>;
  // Token addresses surfaced inside each position's assetsTokenList, with the
  // amounts the position holds. Used for amount-matched filtering of receipt
  // tokens (LSTs, aTokens) the wallet balance API also reports.
  // Key = `${chainId}:${tokenAddress.toLowerCase()}`, value = sorted amounts.
  positionTokenAmounts: Map<string, number[]>;
}

export async function fetchDefiPositionsViaOkx(
  address: string,
  chains: Chain[],
  overrides?: OkxWeb3Creds
): Promise<DefiFetchResult> {
  // Bitcoin has no DeFi via OKX; skip it but pass everything else through.
  const walletAddressList = chains
    .filter((c) => c !== 'bitcoin')
    .map((c) => ({ chainId: CHAIN_INDEX_MAP[c], walletAddress: address }));

  if (walletAddressList.length === 0) {
    return {
      positions: [],
      lpTokenKeys: new Set(),
      positionTokenAmounts: new Map(),
    };
  }

  const listData = (await okxWeb3Request(
    '/api/v5/defi/user/asset/platform/list',
    { method: 'POST', body: { walletAddressList } },
    overrides
  )) as OkxDefiPlatformListResponse;

  if (String(listData.code) !== '0') {
    throw new Error(`OKX DeFi list error: ${listData.msg}`);
  }

  const lpTokenKeys = new Set<string>(
    (listData.data?.lpTokenAddressList ?? []).map((t) =>
      lpKey(t.chainId, t.tokenAddress)
    )
  );

  const platforms = (listData.data?.walletIdPlatformList ?? []).flatMap(
    (w) => w.platformList ?? []
  );

  const positionTokenAmounts = new Map<string, number[]>();

  // Each platform may span multiple chains; one detail call returns all of them.
  const detailPromises = platforms
    .filter((p) => parseFloat(p.currencyAmount || '0') >= DEFI_MIN_USD)
    .map((p) =>
      fetchPlatformDetail(p, walletAddressList, positionTokenAmounts, overrides).catch(
        (err) => {
          console.warn(`OKX DeFi detail failed for ${p.platformName}:`, err);
          return [] as DefiProtocolPosition[];
        }
      )
    );

  const positions = (await Promise.all(detailPromises)).flat();
  positions.sort((a, b) => b.totalUsdValue - a.totalUsdValue);

  return { positions, lpTokenKeys, positionTokenAmounts };
}

async function fetchPlatformDetail(
  platform: OkxDefiPlatform,
  walletAddressList: Array<{ chainId: string; walletAddress: string }>,
  positionTokenAmounts: Map<string, number[]>,
  overrides?: OkxWeb3Creds
): Promise<DefiProtocolPosition[]> {
  const detail = (await okxWeb3Request(
    '/api/v5/defi/user/asset/platform/detail',
    {
      method: 'POST',
      body: {
        analysisPlatformId: String(platform.analysisPlatformId),
        accountIdInfoList: [{ walletAddressList }],
      },
    },
    overrides
  )) as OkxDefiPlatformDetailResponse;

  if (String(detail.code) !== '0') {
    throw new Error(`OKX DeFi detail error: ${detail.msg}`);
  }

  const networkHolds = (detail.data?.walletIdPlatformDetailList ?? []).flatMap(
    (w) => w.networkHoldVoList ?? []
  );

  return networkHolds
    .map((nh) => buildProtocolPosition(platform, nh, positionTokenAmounts))
    .filter((p) => p.totalUsdValue >= DEFI_MIN_USD);
}

function buildProtocolPosition(
  platform: OkxDefiPlatform,
  nh: OkxDefiNetworkHold,
  positionTokenAmounts: Map<string, number[]>
): DefiProtocolPosition {
  const positions: DefiPositionItem[] = (nh.investTokenBalanceVoList ?? []).map(
    (inv) => ({
      type: INVEST_TYPE_MAP[inv.investType] ?? 'other',
      totalUsdValue: parseFloat(inv.totalValue || '0'),
      tokens: (inv.assetsTokenList ?? []).map((t) => {
        const amount = parseFloat(t.coinAmount || '0');
        if (t.tokenAddress && amount > 0) {
          const key = lpKey(nh.chainId, t.tokenAddress);
          const list = positionTokenAmounts.get(key);
          if (list) list.push(amount);
          else positionTokenAmounts.set(key, [amount]);
        }
        return {
          symbol: t.tokenSymbol,
          amount,
          usdValue: parseFloat(t.currencyAmount || '0'),
          logo: t.tokenLogo,
        };
      }),
    })
  );

  const totalUsdValue = positions.reduce((s, p) => s + p.totalUsdValue, 0);

  return {
    platformId: String(platform.analysisPlatformId),
    platformName: platform.platformName,
    platformLogo: platform.platformLogo,
    platformUrl: platform.platformUrl,
    network: nh.network,
    chainId: nh.chainId,
    totalUsdValue,
    positions,
  };
}

export { lpKey };
