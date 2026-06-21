import type {
  PositionSnapshot,
  PortfolioSummarySnapshot,
  SnapshotPayload,
} from '@/types/snapshot';
import type { StocksData } from '@/types/stocks';
import type { WalletBalance } from '@/types/onchain';

// Loose shapes — these come from /api/exchanges/* JSON responses and we only
// need a subset of fields. Keeping it narrow avoids tight coupling with the
// upstream Binance/OKX/Deribit type files.
interface AssetBalanceLike {
  asset: string;
  amount: number;
  usdValue: number;
  dedupedToDefi?: boolean;
}

interface BinanceSubAccountLike {
  label: string;
  balances: AssetBalanceLike[];
}

interface BinanceFuturesPositionLike {
  symbol: string;
  positionAmt: string; // signed: positive = long, negative = short
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  leverage: string;
  positionSide?: string;
  notional?: string;
}

interface BinanceAllDataLike {
  configured?: boolean;
  accounts?: BinanceSubAccountLike[];
  futuresPositions?: BinanceFuturesPositionLike[];
}

interface OkxDataLike {
  configured?: boolean;
  balances?: AssetBalanceLike[];
}

interface DeribitPositionLike {
  instrument_name: string;
  direction: 'buy' | 'sell';
  size: number;
  average_price: number;
  mark_price: number;
  floating_profit_loss: number;
  kind: string;
}

interface DeribitDataLike {
  configured?: boolean;
  positions?: DeribitPositionLike[];
  balances?: AssetBalanceLike[];
  prices?: Record<string, number>;
}

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

const BINANCE_CASH_ACCOUNTS = new Set(['现货', '理财', '资金账户']);

// Binance Simple Earn receipt tokens (LDUSDT, LDUSDC, …) represent the
// underlying stablecoin and should be classified the same way.
function isStable(asset: string): boolean {
  const upper = asset.toUpperCase();
  if (STABLECOINS.has(upper)) return true;
  if (upper.startsWith('LD') && STABLECOINS.has(upper.slice(2))) return true;
  return false;
}

function asPrice(amount: number, usdValue: number): number | undefined {
  if (!Number.isFinite(amount) || amount === 0) return undefined;
  return usdValue / amount;
}

function flattenBinance(data: BinanceAllDataLike | undefined): PositionSnapshot[] {
  if (!data) return [];
  const out: PositionSnapshot[] = [];
  for (const acct of data.accounts ?? []) {
    for (const b of acct.balances ?? []) {
      if (b.dedupedToDefi) continue;
      const stable = isStable(b.asset);
      const isCashAccount = BINANCE_CASH_ACCOUNTS.has(acct.label);
      const kind = stable && isCashAccount ? 'cash' : 'crypto';
      out.push({
        source: 'binance',
        account: acct.label,
        symbol: b.asset,
        kind,
        qty: b.amount,
        side: kind === 'crypto' ? 'long' : undefined,
        priceLocal: asPrice(b.amount, b.usdValue),
        currency: 'USD',
        valueUsd: b.usdValue,
      });
    }
  }
  // Binance futures perp positions — previously dropped from the snapshot
  // because flattenBinance only iterated `accounts`. Now surfaced as
  // crypto_perp with signed qty for the AI export.
  for (const p of data.futuresPositions ?? []) {
    const qty = parseFloat(p.positionAmt);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const markPrice = parseFloat(p.markPrice);
    const entry = parseFloat(p.entryPrice);
    const pnl = parseFloat(p.unRealizedProfit);
    const lev = parseFloat(p.leverage);
    const notional = Math.abs(qty) * markPrice;
    out.push({
      source: 'binance',
      account: 'U本位合约',
      symbol: p.symbol,
      kind: 'crypto_perp',
      qty: Math.abs(qty),
      side: qty >= 0 ? 'long' : 'short',
      entryPrice: Number.isFinite(entry) ? entry : undefined,
      priceLocal: Number.isFinite(markPrice) ? markPrice : undefined,
      markPrice: Number.isFinite(markPrice) ? markPrice : undefined,
      leverage: Number.isFinite(lev) ? lev : undefined,
      currency: 'USD',
      valueUsd: notional,
      pnlUsd: Number.isFinite(pnl) ? pnl : undefined,
    });
  }
  return out;
}

function flattenOkx(data: OkxDataLike | undefined): PositionSnapshot[] {
  if (!data?.balances) return [];
  return data.balances
    .filter((b) => !b.dedupedToDefi)
    .map<PositionSnapshot>((b) => {
      const stable = isStable(b.asset);
      return {
        source: 'okx',
        symbol: b.asset,
        kind: stable ? 'cash' : 'crypto',
        qty: b.amount,
        priceLocal: asPrice(b.amount, b.usdValue),
        currency: 'USD',
        valueUsd: b.usdValue,
      };
    });
}

// Deribit instrument names follow `BTC-25SEP25-50000-P` (option) or
// `BTC-25SEP25` / `BTC-PERPETUAL` (future). Returns whatever fields are
// recoverable; missing fields are simply omitted from the snapshot.
function parseDeribitInstrument(name: string): {
  underlying: string;
  expiry?: string;
  strike?: number;
  optionType?: 'put' | 'call';
  isPerp: boolean;
} {
  const parts = name.split('-');
  const underlying = parts[0];
  const isPerp = parts[1] === 'PERPETUAL';
  let expiry: string | undefined;
  let strike: number | undefined;
  let optionType: 'put' | 'call' | undefined;
  if (parts.length >= 2 && !isPerp) {
    // `25SEP25` → 2025-09-25 (DDMMMYY).
    const m = parts[1].match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
    if (m) {
      const months: Record<string, string> = {
        JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
        JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
      };
      const mm = months[m[2]];
      if (mm) {
        const day = m[1].padStart(2, '0');
        expiry = `20${m[3]}-${mm}-${day}`;
      }
    }
  }
  if (parts.length === 4) {
    const s = parseFloat(parts[2]);
    if (Number.isFinite(s)) strike = s;
    if (parts[3] === 'P') optionType = 'put';
    else if (parts[3] === 'C') optionType = 'call';
  }
  return { underlying, expiry, strike, optionType, isPerp };
}

function flattenDeribit(data: DeribitDataLike | undefined): PositionSnapshot[] {
  if (!data) return [];
  const out: PositionSnapshot[] = [];
  for (const b of data.balances ?? []) {
    out.push({
      source: 'deribit',
      symbol: b.asset,
      kind: 'crypto',
      qty: b.amount,
      side: 'long',
      priceLocal: asPrice(b.amount, b.usdValue),
      currency: 'USD',
      valueUsd: b.usdValue,
    });
  }
  for (const p of data.positions ?? []) {
    const meta = parseDeribitInstrument(p.instrument_name);
    const underlyingPrice = data.prices?.[meta.underlying];
    const absSize = Math.abs(p.size);
    const valueUsd =
      underlyingPrice !== undefined
        ? p.mark_price * absSize * underlyingPrice
        : 0;
    const isOption = p.kind === 'option';
    out.push({
      source: 'deribit',
      symbol: p.instrument_name,
      kind: isOption ? 'option' : 'crypto_perp',
      qty: absSize,
      side: p.direction === 'sell' ? 'short' : 'long',
      entryPrice: p.average_price,
      priceLocal: p.mark_price,
      markPrice: p.mark_price,
      currency: meta.underlying,
      valueLocal: p.mark_price * absSize,
      valueUsd,
      pnlLocal: p.floating_profit_loss,
      underlying: meta.underlying,
      optionType: meta.optionType,
      strike: meta.strike,
      expiry: meta.expiry,
    });
  }
  return out;
}

function flattenOnchain(wallets: WalletBalance[] | undefined): PositionSnapshot[] {
  if (!wallets) return [];
  const out: PositionSnapshot[] = [];
  for (const w of wallets) {
    for (const b of w.balances ?? []) {
      if (b.dedupedToDefi) continue;
      out.push({
        source: 'onchain',
        account: `${w.walletName} (${w.address.slice(0, 6)}…${w.address.slice(-4)})`,
        symbol: b.asset,
        kind: 'token',
        market: b.chainId,
        qty: b.amount,
        priceLocal: asPrice(b.amount, b.usdValue),
        currency: 'USD',
        valueUsd: b.usdValue,
      });
    }
    for (const protocol of w.defiPositions ?? []) {
      // Roll up each protocol as one row; tokens live in `raw` for detail.
      out.push({
        source: 'onchain',
        account: `${w.walletName} (${w.address.slice(0, 6)}…${w.address.slice(-4)})`,
        symbol: protocol.platformName,
        kind: 'defi',
        market: protocol.network,
        qty: 1,
        currency: 'USD',
        valueUsd: protocol.totalUsdValue,
        raw: protocol.positions,
      });
    }
  }
  return out;
}

// IBKR positions encode option metadata in the id field:
//   ibkr:pos:<symbol>:<strike>:<expiry>:<putCall>:<currency>
// `flattenStocks` parses this so the snapshot exposes structured strike /
// expiry / type instead of opaque symbols. Other brokers don't use this scheme
// and just produce id strings that won't match — the parser returns nothing
// and the option fields stay undefined.
function parseIbkrOptionId(id: string): {
  strike?: number;
  expiry?: string;
  optionType?: 'put' | 'call';
} {
  if (!id.startsWith('ibkr:pos:')) return {};
  const parts = id.split(':');
  // [0]=ibkr [1]=pos [2]=symbol [3]=strike [4]=expiry [5]=putCall [6]=currency
  if (parts.length < 7) return {};
  const strikeRaw = parts[3];
  const expiryRaw = parts[4];
  const pcRaw = parts[5];
  const strike = strikeRaw ? parseFloat(strikeRaw) : NaN;
  // IBKR Flex expiry is YYYYMMDD. Normalise to YYYY-MM-DD.
  let expiry: string | undefined;
  if (/^\d{8}$/.test(expiryRaw)) {
    expiry = `${expiryRaw.slice(0, 4)}-${expiryRaw.slice(4, 6)}-${expiryRaw.slice(6, 8)}`;
  } else if (expiryRaw) {
    expiry = expiryRaw;
  }
  return {
    strike: Number.isFinite(strike) ? strike : undefined,
    expiry,
    optionType: pcRaw === 'P' ? 'put' : pcRaw === 'C' ? 'call' : undefined,
  };
}

function flattenStocks(data: StocksData | undefined): PositionSnapshot[] {
  if (!data) return [];
  const out: PositionSnapshot[] = [];
  for (const broker of data.brokers) {
    for (const p of broker.positions) {
      const isOption = p.kind === 'option';
      const opt = isOption ? parseIbkrOptionId(p.id) : {};
      out.push({
        source: broker.broker,
        symbol: p.symbol,
        kind: isOption ? 'option' : 'stock',
        market: p.market,
        qty: Math.abs(p.shares),
        side: p.shares >= 0 ? 'long' : 'short',
        entryPrice: p.costBasis,
        priceLocal: p.price,
        currency: p.currency,
        valueLocal: p.marketValue,
        valueUsd: p.marketValueUsd,
        pnlLocal: p.pnl,
        pnlUsd: p.pnlUsd,
        changePct: p.changePct,
        underlying: isOption ? p.symbol : undefined,
        ...opt,
      });
    }
    for (const c of broker.cash) {
      out.push({
        source: broker.broker,
        symbol: c.currency,
        kind: 'cash',
        qty: c.amount,
        currency: c.currency,
        valueUsd: c.amountUsd,
      });
    }
  }
  return out;
}

// Bank-cash row passed in already converted to USD (FX lives outside snapshot
// generation — callers either use /api/fx or stocks.data.fx).
export interface BankCashInput {
  bank: string;
  currency: string;
  amount: number;
  valueUsd: number;
  note?: string;
}

function flattenBanks(banks: BankCashInput[] | undefined): PositionSnapshot[] {
  if (!banks) return [];
  return banks.map<PositionSnapshot>((b) => ({
    source: 'bank',
    account: b.bank,
    symbol: b.currency,
    kind: 'cash',
    qty: b.amount,
    currency: b.currency,
    valueUsd: b.valueUsd,
  }));
}

export interface BuildSnapshotInput {
  wallet: string;
  binance?: BinanceAllDataLike;
  okx?: OkxDataLike;
  deribit?: DeribitDataLike;
  onchain?: WalletBalance[];
  stocks?: StocksData;
  banks?: BankCashInput[];
  portfolio: PortfolioSummarySnapshot;
}

export function buildSnapshot(input: BuildSnapshotInput): SnapshotPayload {
  const positions = [
    ...flattenBinance(input.binance),
    ...flattenOkx(input.okx),
    ...flattenDeribit(input.deribit),
    ...flattenOnchain(input.onchain),
    ...flattenStocks(input.stocks),
    ...flattenBanks(input.banks),
  ].filter((p) => Number.isFinite(p.valueUsd));

  return {
    wallet: input.wallet.toLowerCase(),
    timestamp: Date.now(),
    positions,
    portfolio: input.portfolio,
  };
}

// Small stable hash for dedup — payloads with same content shouldn't be
// re-uploaded. Skips timestamp (always changes); includes wallet so switching
// accounts always forces a fresh push.
export function snapshotFingerprint(payload: SnapshotPayload): string {
  const compact = {
    w: payload.wallet,
    p: payload.positions.map((x) => [
      x.source,
      x.account ?? '',
      x.symbol,
      x.kind,
      Math.round(x.qty * 1e6),
      Math.round(x.valueUsd * 100),
    ]),
    t: Math.round(payload.portfolio.totalUsd * 100),
  };
  return JSON.stringify(compact);
}
