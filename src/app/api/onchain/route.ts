import { after } from 'next/server';
import { fetchCompleteWallet } from '@/lib/onchain/wallet';
import { buildOnchainCacheKey, onchainWalletCache } from '@/lib/onchain/cache';
import { enforceRateLimit, inputErrorResponse, readJsonBody } from '@/lib/http/guards';
import { parseOnchainBody } from '@/lib/http/validation';

export const maxDuration = 45;

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'onchain', 20, 60);
  if (limited) return limited;
  const credentials = {
    apiKey: request.headers.get('x-okx-web3-api-key') || undefined,
    apiSecret: request.headers.get('x-okx-web3-api-secret') || undefined,
    passphrase: request.headers.get('x-okx-web3-passphrase') || undefined,
    projectId: request.headers.get('x-okx-web3-project-id') || undefined,
  };
  try {
    let body: ReturnType<typeof parseOnchainBody>;
    try { body = parseOnchainBody(await readJsonBody(request)); }
    catch (error) { return inputErrorResponse(error); }
    const { wallets, receiptTokenAddresses, forceRefresh } = body;
    const results = await Promise.all(wallets.map((wallet) =>
      onchainWalletCache.get(
        buildOnchainCacheKey(wallet, receiptTokenAddresses, credentials),
        wallet,
        () => fetchCompleteWallet(wallet, receiptTokenAddresses, credentials),
        (work) => after(work),
        forceRefresh
      )
    ));
    return Response.json(results, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
