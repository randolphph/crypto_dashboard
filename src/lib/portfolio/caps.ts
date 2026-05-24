// Computes per-asset USD totals across all crypto sources (CEX wallets,
// Deribit balances, on-chain wallets) and groups them into BTC / ETH /
// stables / alts buckets. These power the position-cap warnings on the
// dashboard: if BTC > 50%, alts > 30%, etc., the user should rebalance.

const BTC_SYMBOLS = new Set(['BTC', 'WBTC', 'CBBTC', 'TBTC', 'BTCB', 'RENBTC']);
const ETH_SYMBOLS = new Set([
  'ETH',
  'WETH',
  'STETH',
  'WSTETH',
  'CBETH',
  'RETH',
  'WEETH',
  'EZETH',
  'METH',
  'OETH',
]);
const STABLES = new Set([
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
  'BFUSD',
  'LDUSDT',
]);

interface BalanceLike {
  asset: string;
  usdValue: number;
  dedupedToDefi?: boolean;
}

interface BinanceLike {
  configured?: boolean;
  accounts?: Array<{ balances?: BalanceLike[] }>;
}

interface OkxLike {
  configured?: boolean;
  balances?: BalanceLike[];
}

interface DeribitLike {
  configured?: boolean;
  balances?: BalanceLike[];
}

interface OnchainWalletLike {
  balances?: BalanceLike[];
  defiTotalUsdValue?: number;
}

export interface CapTotals {
  btc: number;
  eth: number;
  stables: number;
  alts: number;
  total: number;     // = btc + eth + stables + alts
}

function classifyAsset(asset: string): 'btc' | 'eth' | 'stable' | 'alt' {
  const u = asset.toUpperCase();
  if (BTC_SYMBOLS.has(u)) return 'btc';
  if (ETH_SYMBOLS.has(u)) return 'eth';
  if (STABLES.has(u)) return 'stable';
  return 'alt';
}

function addBalances(totals: CapTotals, balances: BalanceLike[] | undefined) {
  if (!balances) return;
  for (const b of balances) {
    if (b.dedupedToDefi) continue;
    if (!Number.isFinite(b.usdValue) || b.usdValue <= 0) continue;
    const bucket = classifyAsset(b.asset);
    if (bucket === 'btc') totals.btc += b.usdValue;
    else if (bucket === 'eth') totals.eth += b.usdValue;
    else if (bucket === 'stable') totals.stables += b.usdValue;
    else totals.alts += b.usdValue;
  }
}

export function computeCapTotals(input: {
  binance?: BinanceLike;
  okx?: OkxLike;
  deribit?: DeribitLike;
  onchain?: OnchainWalletLike[];
}): CapTotals {
  const totals: CapTotals = {
    btc: 0,
    eth: 0,
    stables: 0,
    alts: 0,
    total: 0,
  };

  if (input.binance && input.binance.configured !== false) {
    for (const acc of input.binance.accounts ?? []) addBalances(totals, acc.balances);
  }
  if (input.okx && input.okx.configured !== false) {
    addBalances(totals, input.okx.balances);
  }
  if (input.deribit && input.deribit.configured !== false) {
    addBalances(totals, input.deribit.balances);
  }
  if (input.onchain) {
    for (const w of input.onchain) {
      addBalances(totals, w.balances);
      // DeFi positions are crypto exposure (LSTs, LPs, vaults) — fold into
      // alts since we don't have per-asset breakdown handy here.
      if (w.defiTotalUsdValue && w.defiTotalUsdValue > 0) {
        totals.alts += w.defiTotalUsdValue;
      }
    }
  }

  totals.total = totals.btc + totals.eth + totals.stables + totals.alts;
  return totals;
}

// Cap thresholds — derived from the user's stated risk principles. Tunable.
export const CAPS = {
  btcMax: 0.5,        // BTC ≤ 50% of crypto operating capital
  ethMax: 0.25,
  altsMax: 0.30,
  stablesMin: 0.10,   // dry powder ≥ 10%
} as const;

export interface CapStatus {
  bucket: 'btc' | 'eth' | 'alts' | 'stables';
  label: string;
  pct: number;        // 0-1
  threshold: number;  // 0-1
  kind: 'over' | 'under';
  severity: 'ok' | 'warn' | 'breach';
}

export function evaluateCaps(totals: CapTotals): CapStatus[] {
  const out: CapStatus[] = [];
  if (totals.total <= 0) return out;

  const pctOf = (n: number) => n / totals.total;

  const checks: Array<Omit<CapStatus, 'severity'>> = [
    {
      bucket: 'btc',
      label: 'BTC',
      pct: pctOf(totals.btc),
      threshold: CAPS.btcMax,
      kind: 'over',
    },
    {
      bucket: 'eth',
      label: 'ETH',
      pct: pctOf(totals.eth),
      threshold: CAPS.ethMax,
      kind: 'over',
    },
    {
      bucket: 'alts',
      label: 'Alts',
      pct: pctOf(totals.alts),
      threshold: CAPS.altsMax,
      kind: 'over',
    },
    {
      bucket: 'stables',
      label: '稳定币',
      pct: pctOf(totals.stables),
      threshold: CAPS.stablesMin,
      kind: 'under',
    },
  ];

  for (const c of checks) {
    let severity: CapStatus['severity'] = 'ok';
    if (c.kind === 'over') {
      if (c.pct > c.threshold * 1.1) severity = 'breach';
      else if (c.pct > c.threshold) severity = 'warn';
    } else {
      // under: more severe if pct is much lower
      if (c.pct < c.threshold * 0.5) severity = 'breach';
      else if (c.pct < c.threshold) severity = 'warn';
    }
    out.push({ ...c, severity });
  }

  return out;
}
