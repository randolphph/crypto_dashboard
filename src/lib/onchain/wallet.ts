import 'server-only';
import { fetchBalancesViaOkx, fetchDefiPositionsViaOkx, isOkxWeb3Available, lpKey, type OkxWeb3Creds, type OkxWeb3Chain } from './okxWeb3';
import { fetchHyperliquidWalletBalances } from './hyperliquid';
import { DEFAULT_RECEIPT_TOKEN_SYMBOLS } from './receiptTokens';
import { isAaveReceiptBalance, isAaveProtocol } from './aaveReceipts';
import type { WalletConfig, WalletBalance, Chain } from '@/types/onchain';

function getWalletChains(wallet: WalletConfig): Chain[] {
  // Backward compat: migrate legacy `network` field
  if (wallet.chains?.length) return wallet.chains;
  if (wallet.network) return [wallet.network];
  return ['ethereum'];
}

// Regex layer of scheme B. Patterns stay server-side (not user-editable
// through the UI) — the user-editable symbol set is passed in from the client.
const RECEIPT_TOKEN_PATTERNS: RegExp[] = [
  // Yearn vault tokens
  /^yv?[A-Z][A-Za-z0-9]+$/,
  // Convex
  /^cvx[A-Z]/,
  // Pendle markets
  /^(PT|YT|LP)-/,
];

// Strip our multi-chain decoration: "stETH(ETH)" → "stETH".
function bareSymbol(symbol: string): string {
  return symbol.replace(/\([^)]+\)$/, '').trim();
}

function looksLikeReceiptToken(
  symbol: string,
  receiptSymbols: Set<string>
): boolean {
  if (!symbol) return false;
  if (receiptSymbols.has(symbol)) return true;
  return RECEIPT_TOKEN_PATTERNS.some((re) => re.test(symbol));
}

export async function fetchCompleteWallet(
  wallet: WalletConfig,
  receiptTokenAddresses: Array<{ chainId: string; tokenAddress: string }>,
  credentials: OkxWeb3Creds
): Promise<WalletBalance> {
  const okxWeb3Creds = { ...credentials, signal: AbortSignal.timeout(35_000) };
  const receiptSymbols = new Set<string>(DEFAULT_RECEIPT_TOKEN_SYMBOLS);
  const userReceiptKeys = new Set(receiptTokenAddresses.map((e) => lpKey(e.chainId, e.tokenAddress)));
  try {
    const chains = getWalletChains(wallet);
    const isHyperliquid = chains.includes('hyperliquid');
    const okxChains = chains.filter(
      (c): c is OkxWeb3Chain => c !== 'hyperliquid'
    );

    const balancePromises: Promise<import('@/types/common').AssetBalance[]>[] = [];

    if (isHyperliquid) {
      balancePromises.push(fetchHyperliquidWalletBalances(wallet));
    }
    if (okxChains.length > 0) {
      if (!isOkxWeb3Available(okxWeb3Creds)) throw new Error('OKX Web3 凭据未配置，无法获取完整链上资产');
      balancePromises.push(fetchBalancesViaOkx(wallet.address, okxChains, okxWeb3Creds));
    }

    const emptyDefi = {
      positions: [],
      lpTokenKeys: new Set<string>(),
      positionTokenAmounts: new Map<string, number[]>(),
    };
    const defiPromise = isOkxWeb3Available(okxWeb3Creds) && okxChains.length > 0
      ? fetchDefiPositionsViaOkx(wallet.address, okxChains, okxWeb3Creds)
      : Promise.resolve(emptyDefi);

    const [balanceResults, defiResult] = await Promise.all([
      Promise.all(balancePromises),
      defiPromise,
    ]);
    const rawBalances = balanceResults.flat();

    // Symbols reported by non-Aave DeFi positions. Scheme B uses
    // this as a cross-check so we only drop a "looks like a receipt"
    // wallet token when the same symbol shows up in an active position —
    // otherwise a user holding stETH without a Lido position would see
    // it silently disappear.
    const positionSymbols = new Set<string>();
    for (const protocol of defiResult.positions) {
      if (isAaveProtocol(protocol.platformName)) continue;
      for (const pos of protocol.positions) {
        for (const t of pos.tokens) positionSymbols.add(t.symbol);
      }
    }

    // Mark receipt tokens excluded from wallet assets. They remain in
    // the response for display but never contribute to totalUsdValue.
    //   C.  (chainId, address) in the user's manual list → unconditional.
    //   A.1 Address in OKX-flagged LP/position-token list.
    //   A.2 Address in a non-Aave position's assetsTokenList AND wallet
    //       amount matches a position amount within ±1%. Catches LSTs.
    //   A.3 Aave aTokens are always excluded, even without DeFi data.
    //   B.  Symbol matches a known receipt-token pattern AND the same
    //       symbol appears in some current DeFi position. Fallback when
    //       a position reports a different underlying address than the
    //       receipt held in the wallet.
    const AMOUNT_TOLERANCE = 0.01;
    const isDeduped = (b: import('@/types/common').AssetBalance): boolean => {
      if (isAaveReceiptBalance(b)) return true;
      if (b.tokenAddress && b.chainId) {
        const key = lpKey(b.chainId, b.tokenAddress);
        if (userReceiptKeys.has(key)) return true;
        if (defiResult.lpTokenKeys.has(key)) return true;
        const positionAmounts = defiResult.positionTokenAmounts.get(key);
        if (positionAmounts) {
          const matches = positionAmounts.some((amt) => {
            const denom = Math.max(amt, b.amount);
            return denom > 0 && Math.abs(amt - b.amount) / denom <= AMOUNT_TOLERANCE;
          });
          if (matches) return true;
        }
      }
      const sym = bareSymbol(b.asset);
      return (
        looksLikeReceiptToken(sym, receiptSymbols) && positionSymbols.has(sym)
      );
    };

    const markedBalances = rawBalances.map((b) => ({
      ...b,
      dedupedToDefi: isDeduped(b),
      exclusionReason: isAaveReceiptBalance(b) ? 'aave-receipt' as const : undefined,
    }));

    // Treat OKX Web3 as the authoritative source for on-chain balances
    // and valuations. Do not submit its token list to another price feed:
    // dust / delisted tokens can legitimately have no tokenPrice there.
    // Those records carry a zero USD value and are omitted below, without
    // turning the wallet or the portfolio into a data-quality warning.
    const balancesWithUsd = markedBalances
      .filter((b) => b.usdValue >= 1);

    const balancesUsd = balancesWithUsd
      .filter((b) => !b.dedupedToDefi)
      .reduce((sum, b) => sum + b.usdValue, 0);
    const defiTotalUsdValue = defiResult.positions.reduce(
      (sum, p) => sum + p.totalUsdValue,
      0
    );

    return {
      walletId: wallet.id,
      walletName: wallet.name,
      address: wallet.address,
      chains,
      balances: balancesWithUsd,
      totalUsdValue: balancesUsd + defiTotalUsdValue,
      defiPositions: defiResult.positions,
      defiTotalUsdValue,
      dataQuality: {
        complete: true,
        errors: [],
      },
    };
  } catch (error) {
    return {
      walletId: wallet.id,
      walletName: wallet.name,
      address: wallet.address,
      chains: getWalletChains(wallet),
      balances: [],
      totalUsdValue: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
