import 'server-only';
import crypto from 'crypto';
import type { AssetBalance } from '@/types/common';

const BASE_URL = 'https://api.binance.com';
const FAPI_URL = 'https://fapi.binance.com';
const DAPI_URL = 'https://dapi.binance.com';

function signQuery(queryString: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function binanceRequest(
  baseUrl: string,
  path: string,
  apiKey: string,
  apiSecret: string,
  extraParams?: Record<string, string>,
  method: 'GET' | 'POST' = 'GET'
): Promise<unknown> {
  const timestamp = Date.now();
  const params = new URLSearchParams({
    timestamp: timestamp.toString(),
    recvWindow: '5000',
    ...extraParams,
  });
  const queryString = params.toString();
  const signature = signQuery(queryString, apiSecret);

  const url = `${baseUrl}${path}?${queryString}&signature=${signature}`;
  const res = await fetch(url, {
    method,
    headers: { 'X-MBX-APIKEY': apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance ${path} (${res.status}): ${text}`);
  }

  return res.json();
}

// ---------- Account type interfaces ----------

interface SpotAccountResponse {
  balances: Array<{ asset: string; free: string; locked: string }>;
}

interface FuturesUsdBalanceItem {
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
}

interface FuturesCoinBalanceItem {
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
}

interface EarnPositionItem {
  asset: string;
  totalAmount: string;
}

interface FundingAssetItem {
  asset: string;
  free: string;
  locked: string;
  freeze: string;
}

export interface FuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  positionSide: string;
  notional: string;
}

// ---------- Fetch functions ----------

function getCredentials() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('BINANCE_API_KEY 或 BINANCE_API_SECRET 未配置');
  }
  return { apiKey, apiSecret };
}

async function fetchSpotBalances(
  apiKey: string,
  apiSecret: string
): Promise<AssetBalance[]> {
  const data = (await binanceRequest(
    BASE_URL,
    '/api/v3/account',
    apiKey,
    apiSecret
  )) as SpotAccountResponse;

  return data.balances
    .map((b) => ({
      asset: b.asset,
      amount: parseFloat(b.free) + parseFloat(b.locked),
      usdValue: 0,
    }))
    .filter((b) => b.amount > 0);
}

async function fetchFuturesUsdBalances(
  apiKey: string,
  apiSecret: string
): Promise<{ balances: AssetBalance[]; error?: string }> {
  try {
    const data = (await binanceRequest(
      FAPI_URL,
      '/fapi/v2/balance',
      apiKey,
      apiSecret
    )) as FuturesUsdBalanceItem[];

    return {
      balances: data
        .map((b) => ({
          asset: b.asset,
          amount: parseFloat(b.balance) + parseFloat(b.crossUnPnl),
          usdValue: 0,
        }))
        .filter((b) => b.amount > 0),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Binance U本位] 错误:', msg);
    return { balances: [], error: msg };
  }
}

async function fetchFuturesCoinBalances(
  apiKey: string,
  apiSecret: string
): Promise<{ balances: AssetBalance[]; error?: string }> {
  try {
    const data = (await binanceRequest(
      DAPI_URL,
      '/dapi/v1/balance',
      apiKey,
      apiSecret
    )) as FuturesCoinBalanceItem[];

    return {
      balances: data
        .map((b) => ({
          asset: b.asset,
          amount: parseFloat(b.balance) + parseFloat(b.crossUnPnl),
          usdValue: 0,
        }))
        .filter((b) => b.amount > 0),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Binance 币本位] 错误:', msg);
    return { balances: [], error: msg };
  }
}

async function fetchEarnBalances(
  apiKey: string,
  apiSecret: string
): Promise<AssetBalance[]> {
  const balances: AssetBalance[] = [];

  // Simple Earn - Flexible
  try {
    const flexData = (await binanceRequest(
      BASE_URL,
      '/sapi/v1/simple-earn/flexible/position',
      apiKey,
      apiSecret,
      { size: '100' }
    )) as { rows: EarnPositionItem[] };

    if (flexData.rows) {
      for (const row of flexData.rows) {
        const amount = parseFloat(row.totalAmount);
        if (amount > 0) {
          balances.push({ asset: row.asset, amount, usdValue: 0 });
        }
      }
    }
  } catch {
    // Simple Earn API may not be available
  }

  // Simple Earn - Locked
  try {
    const lockedData = (await binanceRequest(
      BASE_URL,
      '/sapi/v1/simple-earn/locked/position',
      apiKey,
      apiSecret,
      { size: '100' }
    )) as { rows: EarnPositionItem[] };

    if (lockedData.rows) {
      for (const row of lockedData.rows) {
        const amount = parseFloat(row.totalAmount);
        if (amount > 0) {
          balances.push({ asset: row.asset, amount, usdValue: 0 });
        }
      }
    }
  } catch {
    // Locked earn may not be available
  }

  return balances;
}

async function fetchFundingBalances(
  apiKey: string,
  apiSecret: string
): Promise<AssetBalance[]> {
  try {
    const data = (await binanceRequest(
      BASE_URL,
      '/sapi/v1/asset/get-funding-asset',
      apiKey,
      apiSecret,
      undefined,
      'POST'
    )) as FundingAssetItem[];

    return data
      .map((b) => ({
        asset: b.asset,
        amount: parseFloat(b.free) + parseFloat(b.locked) + parseFloat(b.freeze),
        usdValue: 0,
      }))
      .filter((b) => b.amount > 0);
  } catch {
    return [];
  }
}

async function fetchFuturesUsdPositions(
  apiKey: string,
  apiSecret: string
): Promise<FuturesPosition[]> {
  try {
    const data = (await binanceRequest(
      FAPI_URL,
      '/fapi/v2/positionRisk',
      apiKey,
      apiSecret
    )) as FuturesPosition[];

    return data.filter((p) => parseFloat(p.positionAmt) !== 0);
  } catch (e) {
    console.error('[Binance U本位持仓] 错误:', e instanceof Error ? e.message : e);
    return [];
  }
}

// ---------- Aggregated result ----------

export interface BinanceSubAccount {
  label: string;
  balances: AssetBalance[];
  error?: string;
}

export interface BinanceAllData {
  accounts: BinanceSubAccount[];
  futuresPositions: FuturesPosition[];
}

export async function fetchBinanceAllBalances(): Promise<BinanceAllData> {
  const { apiKey, apiSecret } = getCredentials();

  const [spot, futuresUsd, futuresCoin, earn, funding, futuresPositions] =
    await Promise.all([
      fetchSpotBalances(apiKey, apiSecret),
      fetchFuturesUsdBalances(apiKey, apiSecret),
      fetchFuturesCoinBalances(apiKey, apiSecret),
      fetchEarnBalances(apiKey, apiSecret),
      fetchFundingBalances(apiKey, apiSecret),
      fetchFuturesUsdPositions(apiKey, apiSecret),
    ]);

  const accounts: BinanceSubAccount[] = [];

  if (spot.length > 0) accounts.push({ label: '现货', balances: spot });
  if (futuresUsd.balances.length > 0 || futuresUsd.error)
    accounts.push({ label: 'U本位合约', balances: futuresUsd.balances, error: futuresUsd.error });
  if (futuresCoin.balances.length > 0 || futuresCoin.error)
    accounts.push({ label: '币本位合约', balances: futuresCoin.balances, error: futuresCoin.error });
  if (earn.length > 0) accounts.push({ label: '理财', balances: earn });
  if (funding.length > 0) accounts.push({ label: '资金账户', balances: funding });

  return { accounts, futuresPositions };
}

// Keep backward compatible
export async function fetchBinanceBalances(): Promise<AssetBalance[]> {
  const { accounts } = await fetchBinanceAllBalances();
  return accounts.flatMap((a) => a.balances);
}
