import 'server-only';
import crypto from 'crypto';
import type { AssetBalance } from '@/types/common';

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

  const res = await fetch(`${BASE_URL}${path}`, {
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
  data: Array<{
    details: Array<{
      ccy: string;
      availBal: string;
      frozenBal: string;
      eq: string;
    }>;
  }>;
}

export async function fetchOkxBalances(): Promise<AssetBalance[]> {
  const apiKey = process.env.OKX_API_KEY;
  const apiSecret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_PASSPHRASE;

  if (!apiKey || !apiSecret || !passphrase) {
    throw new Error('OKX_API_KEY, OKX_API_SECRET 或 OKX_PASSPHRASE 未配置');
  }

  const data = (await okxRequest(
    '/api/v5/account/balance',
    apiKey,
    apiSecret,
    passphrase
  )) as OkxBalanceResponse;

  if (data.code !== '0' || !data.data?.[0]) {
    throw new Error(`OKX API returned error: ${JSON.stringify(data)}`);
  }

  const balances: AssetBalance[] = data.data[0].details
    .map((d) => ({
      asset: d.ccy,
      amount: parseFloat(d.availBal) + parseFloat(d.frozenBal),
      usdValue: parseFloat(d.eq) || 0,
    }))
    .filter((b) => b.amount > 0);

  return balances;
}
