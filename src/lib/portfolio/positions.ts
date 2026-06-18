// Position composition breakdown (excludes cash). Slices the portfolio into
// 7 buckets by direction: crypto spot, long/short futures, long/short options,
// stock long/short. Values use notional / market value口径 — for derivatives
// we want exposure size, not margin used, so the slices stay comparable to
// stock market value. Each bucket carries `details` so the pie's hover
// tooltip can drill into where the exposure actually lives.

import type { WalletBalance } from '@/types/onchain';
import type { StocksData } from '@/types/stocks';
import { BROKER_LABEL } from '@/types/stocks';

const STABLECOINS = new Set([
  'USDT',
  'USDC',
  'USD1',
  'DAI',
  'FDUSD',
  'TUSD',
  'BUSD',
  'PYUSD',
  'USDP',
  'USDD',
]);

const BINANCE_CASH_LIKE = new Set(['现货', '理财', '资金账户']);

interface AssetBalanceLike {
  asset: string;
  amount: number;
  usdValue: number;
  dedupedToDefi?: boolean;
}

interface SubAccountLike {
  label: string;
  balances?: AssetBalanceLike[];
}

interface FuturesPositionLike {
  symbol: string;
  positionAmt: string;
  notional: string;
}

interface GridBotLike {
  symbol: string;
  direction: string;
  investedAmt: number;
}

interface BinanceDataLike {
  configured?: boolean;
  accounts?: SubAccountLike[];
  futuresPositions?: FuturesPositionLike[];
  gridBots?: GridBotLike[];
}

interface OkxDataLike {
  configured?: boolean;
  balances?: AssetBalanceLike[];
  futuresPositions?: FuturesPositionLike[];
  gridBots?: GridBotLike[];
}

interface DeribitPositionLike {
  instrument_name: string;
  direction: 'buy' | 'sell';
  size: number;
  mark_price: number;
  kind: string;
}

interface DeribitDataLike {
  configured?: boolean;
  positions?: DeribitPositionLike[];
  prices?: Record<string, number>;
}

export interface PositionBreakdownInput {
  binance?: BinanceDataLike;
  okx?: OkxDataLike;
  deribit?: DeribitDataLike;
  onchain?: WalletBalance[];
  stocks?: StocksData;
}

export interface PositionBreakdownItem {
  label: string;
  value: number;
  details?: PositionBreakdownItem[];
}

function isStable(asset: string): boolean {
  const upper = asset.toUpperCase();
  if (STABLECOINS.has(upper)) return true;
  // Binance Simple Earn receipt tokens (LDUSDT, LDUSDC, …) show up in the
  // spot balance endpoint with an "LD" prefix but still represent the same
  // underlying stablecoin — they should be classified as cash, not crypto.
  if (upper.startsWith('LD') && STABLECOINS.has(upper.slice(2))) return true;
  return false;
}

interface DirectionalBucket {
  long: number;
  short: number;
  longDetails: PositionBreakdownItem[];
  shortDetails: PositionBreakdownItem[];
}

function emptyBucket(): DirectionalBucket {
  return { long: 0, short: 0, longDetails: [], shortDetails: [] };
}

function addExchangeDerivatives(
  exchange: string,
  data: BinanceDataLike | OkxDataLike | undefined,
  bucket: DirectionalBucket
) {
  if (!data || data.configured === false) return;
  for (const p of data.futuresPositions ?? []) {
    const amt = parseFloat(p.positionAmt);
    const notional = Math.abs(parseFloat(p.notional || '0'));
    if (!Number.isFinite(notional) || notional === 0) continue;
    const detail = { label: `${exchange} ${p.symbol}`, value: notional };
    if (amt > 0) {
      bucket.long += notional;
      bucket.longDetails.push(detail);
    } else if (amt < 0) {
      bucket.short += notional;
      bucket.shortDetails.push(detail);
    }
  }
  for (const g of data.gridBots ?? []) {
    if (!Number.isFinite(g.investedAmt) || g.investedAmt <= 0) continue;
    const detail = {
      label: `${exchange} 网格 ${g.symbol}`,
      value: g.investedAmt,
    };
    if (g.direction === 'SHORT') {
      bucket.short += g.investedAmt;
      bucket.shortDetails.push(detail);
    } else {
      bucket.long += g.investedAmt;
      bucket.longDetails.push(detail);
    }
  }
}

function sortDetails(items: PositionBreakdownItem[]): PositionBreakdownItem[] {
  return [...items].sort((a, b) => b.value - a.value);
}

export function buildPositionBreakdown(
  input: PositionBreakdownInput
): PositionBreakdownItem[] {
  // Crypto spot is aggregated at the source level: Binance 现货+理财, OKX,
  // 链上 wallets, DeFi. Per-coin detail would explode the tooltip; source
  // granularity matches the cashDetails / cryptoDetails the category pie
  // already uses, so the two pies feel consistent.
  let binanceSpot = 0;
  let okxSpot = 0;
  let onchainSpot = 0;
  let defiSpot = 0;

  const futures = emptyBucket();
  const options = emptyBucket();

  let stockLong = 0;
  let stockShort = 0;
  const stockLongDetails: PositionBreakdownItem[] = [];
  const stockShortDetails: PositionBreakdownItem[] = [];

  const bin = input.binance;
  if (bin && bin.configured !== false) {
    for (const acc of bin.accounts ?? []) {
      if (!BINANCE_CASH_LIKE.has(acc.label)) continue;
      for (const b of acc.balances ?? []) {
        if (isStable(b.asset)) continue;
        binanceSpot += b.usdValue;
      }
    }
  }
  addExchangeDerivatives('Binance', bin, futures);

  const okx = input.okx;
  if (okx && okx.configured !== false) {
    for (const b of okx.balances ?? []) {
      if (b.dedupedToDefi) continue;
      if (isStable(b.asset)) continue;
      okxSpot += b.usdValue;
    }
  }
  addExchangeDerivatives('OKX', okx, futures);

  const der = input.deribit;
  if (der && der.configured !== false) {
    const prices = der.prices ?? {};
    for (const p of der.positions ?? []) {
      const currency = p.instrument_name.split('-')[0];
      const px = prices[currency] ?? 0;
      const valueUsd = p.mark_price * Math.abs(p.size) * px;
      if (!Number.isFinite(valueUsd) || valueUsd <= 0) continue;
      const bucket = p.kind === 'option' ? options : futures;
      const detail = { label: p.instrument_name, value: valueUsd };
      if (p.direction === 'sell') {
        bucket.short += valueUsd;
        bucket.shortDetails.push(detail);
      } else {
        bucket.long += valueUsd;
        bucket.longDetails.push(detail);
      }
    }
  }

  for (const w of input.onchain ?? []) {
    for (const b of w.balances ?? []) {
      if (b.dedupedToDefi) continue;
      if (isStable(b.asset)) continue;
      onchainSpot += b.usdValue;
    }
    defiSpot += w.defiTotalUsdValue ?? 0;
  }

  for (const broker of input.stocks?.brokers ?? []) {
    const brokerLabel = BROKER_LABEL[broker.broker];
    for (const p of broker.positions) {
      const value = Math.abs(p.marketValueUsd);
      if (!Number.isFinite(value) || value === 0) continue;
      const isShort = p.shares < 0;
      const detail = {
        label: `${brokerLabel} ${p.symbol}`,
        value,
      };
      if (p.kind === 'option') {
        if (isShort) {
          options.short += value;
          options.shortDetails.push(detail);
        } else {
          options.long += value;
          options.longDetails.push(detail);
        }
      } else {
        if (isShort) {
          stockShort += value;
          stockShortDetails.push(detail);
        } else {
          stockLong += value;
          stockLongDetails.push(detail);
        }
      }
    }
  }

  const spotDetails: PositionBreakdownItem[] = [
    { label: 'Binance', value: binanceSpot },
    { label: 'OKX', value: okxSpot },
    { label: '链上', value: onchainSpot },
    { label: 'DeFi', value: defiSpot },
  ].filter((d) => d.value > 0);

  return [
    {
      label: '加密现货',
      value: binanceSpot + okxSpot + onchainSpot + defiSpot,
      details: sortDetails(spotDetails),
    },
    {
      label: '做多合约',
      value: futures.long,
      details: sortDetails(futures.longDetails),
    },
    {
      label: '做空合约',
      value: futures.short,
      details: sortDetails(futures.shortDetails),
    },
    {
      label: '交易期权',
      value: options.long + options.short,
      details: sortDetails([...options.longDetails, ...options.shortDetails]),
    },
    {
      label: '股票现货',
      value: stockLong,
      details: sortDetails(stockLongDetails),
    },
    {
      label: '股票空仓',
      value: stockShort,
      details: sortDetails(stockShortDetails),
    },
  ].filter((x) => x.value > 0);
}
