import { fetchEvmWalletBalances } from '@/lib/onchain/ethereum';
import { fetchSolanaWalletBalances } from '@/lib/onchain/solana';
import { fetchBitcoinWalletBalances } from '@/lib/onchain/bitcoin';
import {
  fetchDefiPositionsViaOkx,
  isOkxWeb3Available,
  lpKey,
} from '@/lib/onchain/okxWeb3';
import { DEFAULT_RECEIPT_TOKEN_SYMBOLS } from '@/lib/onchain/receiptTokens';
import type { WalletConfig, Chain, EvmChain } from '@/types/onchain';
import type { WalletBalance, DefiProtocolPosition } from '@/types/onchain';
import {
  enforceRateLimit,
  inputErrorResponse,
  readJsonBody,
} from '@/lib/http/guards';
import { parseOnchainBody } from '@/lib/http/validation';

export const maxDuration = 45;

function getWalletChains(wallet: WalletConfig): Chain[] {
  // Backward compat: migrate legacy `network` field
  if (wallet.chains?.length) return wallet.chains;
  if (wallet.network) return [wallet.network];
  return ['ethereum'];
}

// Regex layer of scheme B. Patterns stay server-side (not user-editable
// through the UI) — the user-editable symbol set is passed in from the client.
const RECEIPT_TOKEN_PATTERNS: RegExp[] = [
  // Aave a-tokens, including v3 multi-chain naming (aArbUSDC, aBasWETH, etc.)
  /^a(Arb|Bas|Opt|Eth|Pol|Avx|Bnb)?[A-Z][A-Za-z0-9]+$/,
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

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'onchain', 20, 60);
  if (limited) return limited;

  // Read OKX Web3 credentials from headers (client-side override)
  const okxWeb3Creds = {
    apiKey: request.headers.get('x-okx-web3-api-key') || undefined,
    apiSecret: request.headers.get('x-okx-web3-api-secret') || undefined,
    passphrase: request.headers.get('x-okx-web3-passphrase') || undefined,
    projectId: request.headers.get('x-okx-web3-project-id') || undefined,
  };

  try {
    let body: ReturnType<typeof parseOnchainBody>;
    try {
      body = parseOnchainBody(await readJsonBody(request));
    } catch (error) {
      return inputErrorResponse(error);
    }
    const { wallets, receiptTokenAddresses } = body;

    if (!wallets || wallets.length === 0) {
      return Response.json([]);
    }

    // Server-side default symbol set for scheme B (cross-checked against
    // active DeFi positions). Not user-editable — users get precise control
    // via the address list (scheme C) instead.
    const receiptSymbols = new Set<string>(DEFAULT_RECEIPT_TOKEN_SYMBOLS);

    // User-supplied unconditional drop list, keyed by chainId:address.
    const userReceiptKeys = new Set<string>(
      (receiptTokenAddresses ?? []).map((e) => lpKey(e.chainId, e.tokenAddress))
    );

    const results: WalletBalance[] = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const chains = getWalletChains(wallet);
          const isSolana = chains.includes('solana');
          const isBitcoin = chains.includes('bitcoin');
          const evmChains = chains.filter((c) => c !== 'solana' && c !== 'bitcoin') as EvmChain[];

          const balancePromises: Promise<import('@/types/common').AssetBalance[]>[] = [];

          if (isSolana) {
            balancePromises.push(fetchSolanaWalletBalances(wallet, okxWeb3Creds));
          }
          if (isBitcoin) {
            balancePromises.push(fetchBitcoinWalletBalances(wallet, okxWeb3Creds));
          }
          if (evmChains.length > 0) {
            balancePromises.push(fetchEvmWalletBalances(wallet, evmChains, okxWeb3Creds));
          }

          const emptyDefi = {
            positions: [] as DefiProtocolPosition[],
            lpTokenKeys: new Set<string>(),
            positionTokenAmounts: new Map<string, number[]>(),
          };
          let defiError: string | null = null;
          const defiPromise = isOkxWeb3Available(okxWeb3Creds)
            ? fetchDefiPositionsViaOkx(wallet.address, chains, okxWeb3Creds).catch(
                (err) => {
                  console.warn(`OKX DeFi fetch failed for ${wallet.name}:`, err);
                  defiError = err instanceof Error ? err.message : String(err);
                  return emptyDefi;
                }
              )
            : Promise.resolve(emptyDefi);

          const [balanceResults, defiResult] = await Promise.all([
            Promise.all(balancePromises),
            defiPromise,
          ]);
          const rawBalances = balanceResults.flat();

          // Symbols actually reported by current DeFi positions. Scheme B uses
          // this as a cross-check so we only drop a "looks like a receipt"
          // wallet token when the same symbol shows up in an active position —
          // otherwise a user holding stETH without a Lido position would see
          // it silently disappear.
          const positionSymbols = new Set<string>();
          for (const protocol of defiResult.positions) {
            for (const pos of protocol.positions) {
              for (const t of pos.tokens) positionSymbols.add(t.symbol);
            }
          }

          // Mark tokens that DeFi positions already represent. Marked tokens
          // stay in the response (rendered with a "deduped" badge for
          // transparency) but are excluded from totalUsdValue.
          //   C.  (chainId, address) in the user's manual list → unconditional.
          //   A.1 Address in OKX-flagged LP/position-token list.
          //   A.2 Address in a position's assetsTokenList AND wallet amount
          //       matches a position amount within ±1%. Catches LSTs/aTokens.
          //   B.  Symbol matches a known receipt-token pattern AND the same
          //       symbol appears in some current DeFi position. Fallback when
          //       a position reports a different underlying address than the
          //       receipt held in the wallet.
          const AMOUNT_TOLERANCE = 0.01;
          const isDeduped = (b: import('@/types/common').AssetBalance): boolean => {
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
              complete: defiError === null,
              errors: defiError ? [`DeFi: ${defiError}`] : [],
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
      })
    );

    return Response.json(results, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
