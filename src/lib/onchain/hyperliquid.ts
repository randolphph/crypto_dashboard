import 'server-only';

import { fetchWithTimeout } from '@/lib/http/fetch';
import type { AssetBalance } from '@/types/common';
import type { WalletConfig } from '@/types/onchain';

const INFO_URL = 'https://api.hyperliquid.xyz/info';

interface SpotBalance {
  coin?: string;
  token?: number;
  total?: string;
}

interface SpotState {
  balances?: SpotBalance[];
}

interface SpotMeta {
  tokens?: Array<{ index?: number; name?: string }>;
  universe?: Array<{ index?: number; tokens?: number[] }>;
}

function positiveNumber(value: unknown): number {
  const parsed = typeof value === 'string' || typeof value === 'number'
    ? Number(value)
    : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function infoRequest<T>(body: Record<string, string>): Promise<T> {
  const response = await fetchWithTimeout(
    INFO_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    },
    12_000
  );
  if (!response.ok) {
    throw new Error(`Hyperliquid 资产查询失败（HTTP ${response.status}）`);
  }
  return response.json() as Promise<T>;
}

/**
 * Hyperliquid spot assets, following OKX's official Hyperliquid plugin:
 * balances come from spotClearinghouseState and are valued with spotMeta +
 * allMids. Perpetual account equity is intentionally excluded because it
 * overlaps with the USDC balance in this dashboard's asset view.
 */
export async function fetchHyperliquidWalletBalances(
  wallet: WalletConfig
): Promise<AssetBalance[]> {
  const user = wallet.address.toLowerCase();
  const [spotState, spotMeta, mids] = await Promise.all([
    infoRequest<SpotState>({ type: 'spotClearinghouseState', user }),
    infoRequest<SpotMeta>({ type: 'spotMeta' }),
    infoRequest<Record<string, string>>({ type: 'allMids' }),
  ]);

  const balances: AssetBalance[] = [];

  const tokenNames = new Map<number, string>();
  for (const token of spotMeta.tokens ?? []) {
    if (typeof token.index === 'number' && token.name) {
      tokenNames.set(token.index, token.name);
    }
  }

  const tokenMarkets = new Map<number, number>();
  for (const market of spotMeta.universe ?? []) {
    const tokenIndex = market.tokens?.[0];
    if (typeof tokenIndex === 'number' && typeof market.index === 'number') {
      tokenMarkets.set(tokenIndex, market.index);
    }
  }

  const multiChain = wallet.chains.length > 1;
  for (const balance of spotState.balances ?? []) {
    const amount = positiveNumber(balance.total);
    if (amount <= 0 || typeof balance.token !== 'number') continue;

    const symbol = balance.coin || tokenNames.get(balance.token) || '未知资产';
    const marketIndex = tokenMarkets.get(balance.token);
    const price = balance.token === 0
      ? 1
      : positiveNumber(
          marketIndex === undefined ? undefined : mids[`@${marketIndex}`]
        );
    const usdValue = amount * price;
    if (usdValue <= 0) continue;

    balances.push({
      asset: multiChain ? `${symbol}(Hyperliquid)` : symbol,
      amount,
      usdValue,
      chainId: 'hyperliquid',
    });
  }

  return balances;
}
