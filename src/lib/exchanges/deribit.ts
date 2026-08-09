import 'server-only';
import type { DeribitPosition, DeribitAccountSummary } from '@/types/deribit';
import { fetchWithTimeout } from '@/lib/http/fetch';

const BASE_URL = 'https://www.deribit.com';

// Module-level token cache
let tokenCache: { token: string; expiresAt: number } | null = null;

async function authenticate(
  clientIdOverride?: string,
  clientSecretOverride?: string
): Promise<string> {
  const clientId = clientIdOverride || process.env.DERIBIT_CLIENT_ID;
  const clientSecret = clientSecretOverride || process.env.DERIBIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('DERIBIT_CLIENT_ID 或 DERIBIT_CLIENT_SECRET 未配置');
  }

  // Check cached token (skip cache when using overrides to avoid cross-user leaks)
  if (!clientIdOverride && tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const res = await fetchWithTimeout(
    `${BASE_URL}/api/v2/public/auth?` +
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      })
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deribit auth error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const token = data.result.access_token;
  const expiresIn = data.result.expires_in || 900;

  tokenCache = {
    token,
    expiresAt: Date.now() + (expiresIn - 60) * 1000, // refresh 60s before expiry
  };

  return token;
}

async function deribitRequest(
  path: string,
  params: Record<string, string>,
  token: string
): Promise<unknown> {
  const url = `${BASE_URL}${path}?${new URLSearchParams(params)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deribit API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.result;
}

export async function fetchDeribitPositions(
  token: string,
  currency: string
): Promise<DeribitPosition[]> {
  const result = (await deribitRequest(
    '/api/v2/private/get_positions',
    { currency, kind: 'option' },
    token
  )) as Array<{
    instrument_name: string;
    direction: 'buy' | 'sell';
    size: number;
    average_price: number;
    mark_price: number;
    floating_profit_loss: number;
    total_profit_loss: number;
    kind: string;
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  }>;

  return result.map((p) => ({
    instrument_name: p.instrument_name,
    direction: p.direction,
    size: p.size,
    average_price: p.average_price,
    mark_price: p.mark_price,
    floating_profit_loss: p.floating_profit_loss,
    total_profit_loss: p.total_profit_loss,
    kind: p.kind,
    delta: p.delta,
    gamma: p.gamma,
    theta: p.theta,
    vega: p.vega,
  }));
}

export async function fetchDeribitAccountSummary(
  token: string,
  currency: string
): Promise<DeribitAccountSummary> {
  const result = (await deribitRequest(
    '/api/v2/private/get_account_summary',
    { currency },
    token
  )) as {
    currency: string;
    equity: number;
    balance: number;
    margin_balance: number;
    available_withdrawal_funds: number;
    initial_margin: number;
    maintenance_margin: number;
    total_equity_usd: number;
    options_value: number;
  };

  return {
    currency: result.currency,
    equity: result.equity,
    balance: result.balance,
    margin_balance: result.margin_balance,
    available_withdrawal_funds: result.available_withdrawal_funds,
    initial_margin: result.initial_margin,
    maintenance_margin: result.maintenance_margin,
    total_equity_usd: result.total_equity_usd,
    options_value: result.options_value,
  };
}

// Currencies we query account summaries / positions for. USDC and USDT were
// added so users with stablecoin-margined options aren't silently dropped from
// the totals (Deribit returns the requested currency's slice of cross-portfolio
// margin; if the account doesn't use that currency, the call still succeeds
// with all-zero fields).
const DERIBIT_CURRENCIES = ['BTC', 'ETH', 'USDC', 'USDT'] as const;

export async function fetchDeribitData(
  clientIdOverride?: string,
  clientSecretOverride?: string
) {
  const token = await authenticate(clientIdOverride, clientSecretOverride);

  // allSettled: a currency unsupported by the account (or by Deribit itself)
  // shouldn't take down the whole route.
  const positionResults = await Promise.allSettled(
    DERIBIT_CURRENCIES.map((c) => fetchDeribitPositions(token, c))
  );
  const summaryResults = await Promise.allSettled(
    DERIBIT_CURRENCIES.map((c) => fetchDeribitAccountSummary(token, c))
  );

  const positions = positionResults.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  );
  const accountSummaries = summaryResults
    .filter(
      (r): r is PromiseFulfilledResult<DeribitAccountSummary> =>
        r.status === 'fulfilled'
    )
    .map((r) => r.value);

  const errors: string[] = [];
  positionResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${DERIBIT_CURRENCIES[index]} positions: ${reason}`);
    }
  });
  summaryResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      const reason =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${DERIBIT_CURRENCIES[index]} summary: ${reason}`);
    }
  });

  return { positions, accountSummaries, errors };
}
