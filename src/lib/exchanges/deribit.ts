import 'server-only';
import type { DeribitPosition, DeribitAccountSummary } from '@/types/deribit';

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

  const res = await fetch(
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
  const res = await fetch(url, {
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

export async function fetchDeribitData(
  clientIdOverride?: string,
  clientSecretOverride?: string
) {
  const token = await authenticate(clientIdOverride, clientSecretOverride);

  const [btcPositions, ethPositions, btcSummary, ethSummary] =
    await Promise.all([
      fetchDeribitPositions(token, 'BTC'),
      fetchDeribitPositions(token, 'ETH'),
      fetchDeribitAccountSummary(token, 'BTC'),
      fetchDeribitAccountSummary(token, 'ETH'),
    ]);

  return {
    positions: [...btcPositions, ...ethPositions],
    accountSummaries: [btcSummary, ethSummary],
  };
}
