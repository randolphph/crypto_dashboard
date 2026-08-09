import 'server-only';
import crypto from 'crypto';
import type { AssetBalance } from '@/types/common';
import { fetchWithTimeout } from '@/lib/http/fetch';

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
  const res = await fetchWithTimeout(url, {
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

interface FuturesGridOrder {
  algoId: number;
  symbol: string;
  side: string;
  positionSide: string;
  totalPnl: string;
  investedAmt: string;
  direction: string;
}

interface FuturesGridOpenOrdersResponse {
  total: number;
  orders: FuturesGridOrder[];
}

export interface GridBotSummary {
  algoId: number;
  symbol: string;
  direction: string;
  investedAmt: number;
  totalPnl: number;
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

function getCredentials(
  apiKeyOverride?: string,
  apiSecretOverride?: string
) {
  const apiKey = apiKeyOverride || process.env.BINANCE_API_KEY;
  const apiSecret = apiSecretOverride || process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('BINANCE_API_KEY 或 BINANCE_API_SECRET 未配置');
  }
  return { apiKey, apiSecret };
}

// Simple Earn receipt tokens (LDUSDT, LDUSDC, LDBTC, …) are returned by
// /api/v3/account as if they were spot balances, but the underlying assets
// are either already in the 理财 sub-account (via /simple-earn/* endpoints)
// or pledged as futures collateral. Counting them in 现货 too double-counts
// the same money. We drop them at the source so all downstream aggregators
// (category split, snapshot, positions) see a clean spot.
function isSimpleEarnReceipt(asset: string): boolean {
  return /^LD[A-Z0-9]{2,}$/.test(asset.toUpperCase());
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
    .filter((b) => !isSimpleEarnReceipt(b.asset))
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

async function fetchFuturesGridBots(
  apiKey: string,
  apiSecret: string
): Promise<{ balances: AssetBalance[]; gridBots: GridBotSummary[] }> {
  try {
    const data = (await binanceRequest(
      BASE_URL,
      '/sapi/v1/algo/futures/openOrders',
      apiKey,
      apiSecret
    )) as FuturesGridOpenOrdersResponse;

    if (!data.orders || data.orders.length === 0) {
      return { balances: [], gridBots: [] };
    }

    const gridBots: GridBotSummary[] = data.orders.map((o) => ({
      algoId: o.algoId,
      symbol: o.symbol,
      direction: o.direction,
      investedAmt: parseFloat(o.investedAmt),
      totalPnl: parseFloat(o.totalPnl),
    }));

    // Sum up all invested amounts as USDT balance
    const totalInvested = gridBots.reduce((sum, b) => sum + b.investedAmt, 0);
    const totalPnl = gridBots.reduce((sum, b) => sum + b.totalPnl, 0);
    const totalValue = totalInvested + totalPnl;

    const balances: AssetBalance[] =
      totalValue > 0
        ? [{ asset: 'USDT', amount: totalValue, usdValue: 0 }]
        : [];

    return { balances, gridBots };
  } catch (e) {
    console.error(
      '[Binance 合约网格] 错误:',
      e instanceof Error ? e.message : e
    );
    return { balances: [], gridBots: [] };
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
  gridBots: GridBotSummary[];
}

export async function fetchBinanceAllBalances(
  apiKeyOverride?: string,
  apiSecretOverride?: string,
  enableGridBot?: boolean
): Promise<BinanceAllData> {
  const { apiKey, apiSecret } = getCredentials(apiKeyOverride, apiSecretOverride);

  if (enableGridBot === undefined) {
    enableGridBot = process.env.BINANCE_ENABLE_GRID_BOT === 'true';
  }

  const [spot, futuresUsd, futuresCoin, earn, funding, futuresPositions, gridBotData] =
    await Promise.all([
      fetchSpotBalances(apiKey, apiSecret),
      fetchFuturesUsdBalances(apiKey, apiSecret),
      fetchFuturesCoinBalances(apiKey, apiSecret),
      fetchEarnBalances(apiKey, apiSecret),
      fetchFundingBalances(apiKey, apiSecret),
      fetchFuturesUsdPositions(apiKey, apiSecret),
      enableGridBot
        ? fetchFuturesGridBots(apiKey, apiSecret)
        : Promise.resolve({ balances: [], gridBots: [] }),
    ]);

  const accounts: BinanceSubAccount[] = [];

  if (spot.length > 0) accounts.push({ label: '现货', balances: spot });
  if (futuresUsd.balances.length > 0 || futuresUsd.error)
    accounts.push({ label: 'U本位合约', balances: futuresUsd.balances, error: futuresUsd.error });
  if (futuresCoin.balances.length > 0 || futuresCoin.error)
    accounts.push({ label: '币本位合约', balances: futuresCoin.balances, error: futuresCoin.error });
  if (gridBotData.balances.length > 0)
    accounts.push({ label: '合约网格', balances: gridBotData.balances });
  if (earn.length > 0) accounts.push({ label: '理财', balances: earn });
  if (funding.length > 0) accounts.push({ label: '资金账户', balances: funding });

  return { accounts, futuresPositions, gridBots: gridBotData.gridBots };
}

// Keep backward compatible
export async function fetchBinanceBalances(): Promise<AssetBalance[]> {
  const { accounts } = await fetchBinanceAllBalances();
  return accounts.flatMap((a) => a.balances);
}
