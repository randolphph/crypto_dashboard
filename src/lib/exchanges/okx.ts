import 'server-only';
import crypto from 'crypto';
import type { AssetBalance } from '@/types/common';
import { fetchWithTimeout } from '@/lib/http/fetch';

const BASE_URL = 'https://www.okx.com';

function sign(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secret: string
): string {
  const preSign = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', secret).update(preSign).digest('base64');
}

async function okxRequest(
  path: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string
): Promise<unknown> {
  const timestamp = new Date().toISOString();
  const signature = sign(timestamp, 'GET', path, '', apiSecret);

  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OKX API error (${res.status}): ${text}`);
  }

  return res.json();
}

interface OkxBalanceResponse {
  code: string;
  msg?: string;
  data: Array<{
    details: Array<{
      ccy: string;
      availBal: string;
      frozenBal: string;
      eq: string;
      eqUsd: string;
    }>;
  }>;
}

interface OkxFundingResponse {
  code: string;
  msg?: string;
  data: Array<{
    ccy: string;
    bal: string;
  }>;
}

function balanceNumber(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchOkxBalances(
  apiKeyOverride?: string,
  apiSecretOverride?: string,
  passphraseOverride?: string
): Promise<AssetBalance[]> {
  const apiKey = apiKeyOverride || process.env.OKX_API_KEY;
  const apiSecret = apiSecretOverride || process.env.OKX_API_SECRET;
  const passphrase = passphraseOverride || process.env.OKX_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error('OKX_API_KEY, OKX_API_SECRET 或 OKX_PASSPHRASE 未配置');
  }

  const [data, funding] = await Promise.all([
    okxRequest('/api/v5/account/balance', apiKey, apiSecret, passphrase) as Promise<OkxBalanceResponse>,
    okxRequest('/api/v5/asset/balances', apiKey, apiSecret, passphrase) as Promise<OkxFundingResponse>,
  ]);

  if (data.code !== '0' || !data.data?.[0]) {
    throw new Error(`OKX 交易账户 API error (${data.code}): ${data.msg || 'Invalid balance response'}`);
  }
  if (funding.code !== '0' || !Array.isArray(funding.data)) {
    throw new Error(`OKX 资金账户 API error (${funding.code}): ${funding.msg || 'Invalid balance response'}`);
  }

  const balances: AssetBalance[] = data.data[0].details
    .map((d) => ({
      asset: d.ccy,
      // eq is currency equity, including balances allocated as collateral;
      // eqUsd is its USD valuation. Available balance is only a subset.
      amount: balanceNumber(d.eq),
      usdValue: balanceNumber(d.eqUsd),
    }))
    .filter((b) => b.amount > 0);

  // Funding bal already includes available and frozen funds. Price these
  // rows in the API route before combining them with trading-account rows.
  return [
    ...balances,
    ...funding.data.map((d) => ({
      asset: d.ccy,
      amount: balanceNumber(d.bal),
      usdValue: 0,
    })).filter((b) => b.amount > 0),
  ];
}
