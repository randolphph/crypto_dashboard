import 'server-only';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { AssetBalance } from '@/types/common';
import type { WalletConfig } from '@/types/onchain';

function getConnection() {
  const rpcUrl =
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

export async function fetchSolanaWalletBalances(
  wallet: WalletConfig
): Promise<AssetBalance[]> {
  const connection = getConnection();
  const pubkey = new PublicKey(wallet.address);
  const balances: AssetBalance[] = [];

  // Check for native SOL
  const hasNativeSOL = wallet.trackedTokens.some(
    (t) => !t.contractAddress && t.symbol === 'SOL'
  );

  if (hasNativeSOL) {
    try {
      const lamports = await connection.getBalance(pubkey);
      const amount = lamports / LAMPORTS_PER_SOL;
      if (amount > 0) {
        balances.push({ asset: 'SOL', amount, usdValue: 0 });
      }
    } catch (error) {
      console.error(`Error fetching SOL for ${wallet.name}:`, error);
    }
  }

  // Fetch SPL token accounts
  const splTokens = wallet.trackedTokens.filter((t) => t.contractAddress);
  if (splTokens.length > 0) {
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        pubkey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );

      const mintToToken = new Map(
        splTokens.map((t) => [t.contractAddress, t])
      );

      for (const account of tokenAccounts.value) {
        const parsed = account.account.data.parsed?.info;
        if (!parsed) continue;

        const mint = parsed.mint as string;
        const token = mintToToken.get(mint);
        if (!token) continue;

        const amount = parsed.tokenAmount?.uiAmount;
        if (amount && amount > 0) {
          balances.push({ asset: token.symbol, amount, usdValue: 0 });
        }
      }
    } catch (error) {
      console.error(`Error fetching SPL tokens for ${wallet.name}:`, error);
    }
  }

  return balances;
}
