// Splits portfolio value into "cash" (idle stablecoins, withdrawable) vs
// "crypto" (volatile coins + collateralized exposure). Classification is by
// account type, not by asset symbol alone — USDT sitting in Binance Spot is
// cash, the same USDT used as futures margin is exposure.

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

// Binance sub-account labels that hold withdrawable balances rather than
// margin collateral. Matches the labels emitted by lib/exchanges/binance.ts.
const BINANCE_CASH_LIKE = new Set(['现货', '理财', '资金账户']);

export interface CashCryptoSplit {
  cash: number;
  crypto: number;
}

interface AssetBalanceShape {
  asset: string;
  usdValue: number;
  dedupedToDefi?: boolean;
}

interface BinanceSubAccountShape {
  label: string;
  balances: AssetBalanceShape[];
  totalUsdValue: number;
}

interface BinanceDataShape {
  configured?: boolean;
  accounts?: BinanceSubAccountShape[];
}

interface OkxDataShape {
  configured?: boolean;
  balances?: AssetBalanceShape[];
}

interface DeribitDataShape {
  configured?: boolean;
  totalUsdValue?: number;
}

interface OnchainWalletShape {
  balances?: AssetBalanceShape[];
  defiTotalUsdValue?: number;
}

function isStable(asset: string): boolean {
  return STABLECOINS.has(asset.toUpperCase());
}

function empty(): CashCryptoSplit {
  return { cash: 0, crypto: 0 };
}

export function classifyBinance(data: BinanceDataShape | undefined): CashCryptoSplit {
  if (!data || data.configured === false) return empty();
  const out = empty();
  for (const acc of data.accounts ?? []) {
    if (BINANCE_CASH_LIKE.has(acc.label)) {
      for (const b of acc.balances ?? []) {
        if (isStable(b.asset)) out.cash += b.usdValue;
        else out.crypto += b.usdValue;
      }
    } else {
      // Futures / grid / coin-margin → all collateralized exposure
      out.crypto += acc.totalUsdValue ?? 0;
    }
  }
  return out;
}

export function classifyOkx(data: OkxDataShape | undefined): CashCryptoSplit {
  if (!data || data.configured === false) return empty();
  const out = empty();
  // OKX returns a unified flat balances list; we can't tell which USDT is
  // backing a perp without an extra positions call. User accepted the
  // simplification that stablecoins here count as cash.
  for (const b of data.balances ?? []) {
    if (isStable(b.asset)) out.cash += b.usdValue;
    else out.crypto += b.usdValue;
  }
  return out;
}

export function classifyDeribit(data: DeribitDataShape | undefined): CashCryptoSplit {
  if (!data || data.configured === false) return empty();
  // Deribit equity is collateralized cross-portfolio margin; treat as
  // crypto exposure even when it's USDC denominated.
  return { cash: 0, crypto: data.totalUsdValue ?? 0 };
}

export function classifyOnchain(
  wallets: OnchainWalletShape[] | undefined
): CashCryptoSplit {
  const out = empty();
  for (const w of wallets ?? []) {
    for (const b of w.balances ?? []) {
      if (b.dedupedToDefi) continue;
      if (isStable(b.asset)) out.cash += b.usdValue;
      else out.crypto += b.usdValue;
    }
    out.crypto += w.defiTotalUsdValue ?? 0;
  }
  return out;
}
