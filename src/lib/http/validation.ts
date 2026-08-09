import 'server-only';

import type { WalletConfig, Chain } from '@/types/onchain';
import type {
  CashBalance,
  StockBroker,
  StockMarket,
  StockPosition,
} from '@/types/stocks';
import { RequestInputError } from './guards';

const MARKETS = new Set<StockMarket>(['A', 'HK', 'US', 'KR']);
const BROKERS = new Set<StockBroker>(['ths', 'longport', 'ibkr']);
const CHAINS = new Set<Chain>([
  'ethereum',
  'optimism',
  'arbitrum',
  'base',
  'bsc',
  'solana',
  'bitcoin',
]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safeText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export interface MarketSymbol {
  market: StockMarket;
  symbol: string;
}

export function parseMarketSymbols(
  value: unknown,
  maxItems: number
): MarketSymbol[] {
  if (!Array.isArray(value)) throw new RequestInputError('symbols must be an array');
  if (value.length > maxItems) {
    throw new RequestInputError(`too many symbols (max ${maxItems})`, 413);
  }

  const out: MarketSymbol[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const row = record(item);
    if (!row || !MARKETS.has(row.market as StockMarket) || !safeText(row.symbol, 32)) {
      throw new RequestInputError('invalid market or symbol');
    }
    const market = row.market as StockMarket;
    const symbol = row.symbol.trim();
    const key = `${market}:${symbol.toUpperCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ market, symbol });
    }
  }
  return out;
}

export function parseOnchainBody(value: unknown): {
  wallets: WalletConfig[];
  receiptTokenAddresses: Array<{ chainId: string; tokenAddress: string }>;
} {
  const body = record(value);
  if (!body || !Array.isArray(body.wallets)) {
    throw new RequestInputError('wallets must be an array');
  }
  if (body.wallets.length > 10) {
    throw new RequestInputError('too many wallets (max 10)', 413);
  }

  const wallets: WalletConfig[] = body.wallets.map((item) => {
    const row = record(item);
    if (
      !row ||
      !safeText(row.id, 100) ||
      !safeText(row.name, 100) ||
      !safeText(row.address, 128)
    ) {
      throw new RequestInputError('invalid wallet');
    }

    const rawChains = row.chains;
    if (rawChains !== undefined && !Array.isArray(rawChains)) {
      throw new RequestInputError('wallet chains must be an array');
    }
    if (Array.isArray(rawChains) && rawChains.length > CHAINS.size) {
      throw new RequestInputError('too many wallet chains');
    }
    const chains = (rawChains ?? []).map((chain) => {
      if (!CHAINS.has(chain as Chain)) throw new RequestInputError('invalid chain');
      return chain as Chain;
    });
    const network = row.network;
    if (network !== undefined && !CHAINS.has(network as Chain)) {
      throw new RequestInputError('invalid legacy network');
    }

    return {
      id: row.id.trim(),
      name: row.name.trim(),
      address: row.address.trim(),
      chains,
      network: network as Chain | undefined,
    };
  });

  const rawReceipts = body.receiptTokenAddresses ?? [];
  if (!Array.isArray(rawReceipts)) {
    throw new RequestInputError('receiptTokenAddresses must be an array');
  }
  if (rawReceipts.length > 100) {
    throw new RequestInputError('too many receipt-token addresses (max 100)', 413);
  }
  const receiptTokenAddresses = rawReceipts.map((item) => {
    const row = record(item);
    if (!row || !safeText(row.chainId, 32) || !safeText(row.tokenAddress, 128)) {
      throw new RequestInputError('invalid receipt-token address');
    }
    return {
      chainId: row.chainId.trim(),
      tokenAddress: row.tokenAddress.trim(),
    };
  });

  return { wallets, receiptTokenAddresses };
}

export function parseStocksBody(value: unknown): {
  positions: StockPosition[];
  cash: CashBalance[];
} {
  const body = record(value);
  if (!body) throw new RequestInputError('request body must be an object');
  const rawPositions = body.positions ?? [];
  const rawCash = body.cash ?? [];
  if (!Array.isArray(rawPositions) || !Array.isArray(rawCash)) {
    throw new RequestInputError('positions and cash must be arrays');
  }
  if (rawPositions.length > 200 || rawCash.length > 50) {
    throw new RequestInputError('too many portfolio rows', 413);
  }

  const positions: StockPosition[] = rawPositions.map((item) => {
    const row = record(item);
    if (
      !row ||
      !safeText(row.id, 160) ||
      !BROKERS.has(row.broker as StockBroker) ||
      !MARKETS.has(row.market as StockMarket) ||
      !safeText(row.symbol, 64) ||
      !finite(row.shares)
    ) {
      throw new RequestInputError('invalid stock position');
    }
    if (row.name !== undefined && typeof row.name !== 'string') {
      throw new RequestInputError('invalid position name');
    }
    for (const field of ['costBasis', 'apiPnl', 'multiplier'] as const) {
      if (row[field] !== undefined && !finite(row[field])) {
        throw new RequestInputError(`invalid position ${field}`);
      }
    }
    if (row.kind !== undefined && row.kind !== 'stock' && row.kind !== 'option') {
      throw new RequestInputError('invalid position kind');
    }
    return {
      id: row.id,
      broker: row.broker as StockBroker,
      market: row.market as StockMarket,
      symbol: row.symbol.trim(),
      name: typeof row.name === 'string' ? row.name.slice(0, 200) : undefined,
      shares: row.shares,
      costBasis: row.costBasis as number | undefined,
      apiPnl: row.apiPnl as number | undefined,
      multiplier: row.multiplier as number | undefined,
      kind: row.kind as 'stock' | 'option' | undefined,
    };
  });

  const cash: CashBalance[] = rawCash.map((item) => {
    const row = record(item);
    if (
      !row ||
      !safeText(row.id, 160) ||
      !BROKERS.has(row.broker as StockBroker) ||
      !['CNY', 'HKD', 'USD', 'KRW'].includes(String(row.currency)) ||
      !finite(row.amount)
    ) {
      throw new RequestInputError('invalid cash balance');
    }
    return {
      id: row.id,
      broker: row.broker as StockBroker,
      currency: row.currency as CashBalance['currency'],
      amount: row.amount,
      note: typeof row.note === 'string' ? row.note.slice(0, 500) : undefined,
    };
  });

  return { positions, cash };
}
