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

interface BinanceAllDataLike {
  configured?: boolean;
  accounts?: BinanceSubAccountLike[];
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
  if (!data?.accounts) return [];
  const out: PositionSnapshot[] = [];
  for (const acct of data.accounts) {
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
        priceLocal: asPrice(b.amount, b.usdValue),
        currency: 'USD',
        valueUsd: b.usdValue,
      });
    }
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

function flattenDeribit(data: DeribitDataLike | undefined): PositionSnapshot[] {
  if (!data) return [];
  const out: PositionSnapshot[] = [];
  for (const b of data.balances ?? []) {
    out.push({
      source: 'deribit',
      symbol: b.asset,
      kind: 'crypto',
      qty: b.amount,
      priceLocal: asPrice(b.amount, b.usdValue),
      currency: 'USD',
      valueUsd: b.usdValue,
    });
  }
  for (const p of data.positions ?? []) {
    // Deribit options' size is in contracts (USD-notional for BTC inverse, etc.)
    // Use mark_price as priceLocal and the floating PnL the exchange reports.
    const underlying = p.instrument_name.split('-')[0];
    const underlyingPrice = data.prices?.[underlying];
    const valueUsd =
      underlyingPrice !== undefined
        ? p.mark_price * Math.abs(p.size) * underlyingPrice
        : 0;
    out.push({
      source: 'deribit',
      symbol: p.instrument_name,
      kind: p.kind === 'option' ? 'option' : 'crypto',
      qty: p.direction === 'sell' ? -p.size : p.size,
      priceLocal: p.mark_price,
      currency: underlying,
      valueLocal: p.mark_price * Math.abs(p.size),
      valueUsd,
      pnlLocal: p.floating_profit_loss,
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

function flattenStocks(data: StocksData | undefined): PositionSnapshot[] {
  if (!data) return [];
  const out: PositionSnapshot[] = [];
  for (const broker of data.brokers) {
    for (const p of broker.positions) {
      out.push({
        source: broker.broker,
        symbol: p.symbol,
        kind: p.kind === 'option' ? 'option' : 'stock',
        market: p.market,
        qty: p.shares,
        priceLocal: p.price,
        currency: p.currency,
        valueLocal: p.marketValue,
        valueUsd: p.marketValueUsd,
        pnlLocal: p.pnl,
        pnlUsd: p.pnlUsd,
        changePct: p.changePct,
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

export interface BuildSnapshotInput {
  wallet: string;
  binance?: BinanceAllDataLike;
  okx?: OkxDataLike;
  deribit?: DeribitDataLike;
  onchain?: WalletBalance[];
  stocks?: StocksData;
  portfolio: PortfolioSummarySnapshot;
}

export function buildSnapshot(input: BuildSnapshotInput): SnapshotPayload {
  const positions = [
    ...flattenBinance(input.binance),
    ...flattenOkx(input.okx),
    ...flattenDeribit(input.deribit),
    ...flattenOnchain(input.onchain),
    ...flattenStocks(input.stocks),
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
