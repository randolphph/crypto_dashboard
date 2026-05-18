import 'server-only';
import { lpGet } from './client';
import type { LongportCreds } from './sign';
import type {
  StockPosition,
  StockMarket,
  StockCurrency,
  CashBalance,
} from '@/types/stocks';

interface LpStockInfo {
  symbol: string;
  symbol_name: string;
  currency: string;
  market: string;
  quantity: string;
  cost_price: string;
}

interface LpStockChannel {
  account_channel: string;
  stock_info: LpStockInfo[];
}

interface LpCashInfo {
  available_cash: string;
  withdraw_cash?: string;
  frozen_cash?: string;
  settling_cash?: string;
  currency: string;
}

interface LpAccountEntry {
  currency: string;
  cash_infos: LpCashInfo[];
}

function mapMarket(market: string, symbol: string): StockMarket | null {
  const m = market.toUpperCase();
  if (m === 'HK') return 'HK';
  if (m === 'US') return 'US';
  if (m === 'CN' || m === 'SH' || m === 'SZ' || m === 'BJ') return 'A';
  if (/\.HK$/i.test(symbol)) return 'HK';
  if (/\.US$/i.test(symbol)) return 'US';
  if (/\.(SH|SZ|BJ)$/i.test(symbol)) return 'A';
  return null;
}

function stripSymbolSuffix(s: string): string {
  return s.replace(/\.(HK|US|SH|SZ|BJ|CN)$/i, '');
}

function mapCurrency(c: string): StockCurrency | null {
  const u = c.toUpperCase();
  if (u === 'CNY' || u === 'CNH' || u === 'RMB') return 'CNY';
  if (u === 'HKD') return 'HKD';
  if (u === 'USD') return 'USD';
  return null;
}

export async function fetchLongportPositions(
  creds: LongportCreds
): Promise<StockPosition[]> {
  const data = await lpGet<{ list: LpStockChannel[] }>(
    creds,
    '/v1/asset/stock'
  );
  const out: StockPosition[] = [];
  for (const channel of data.list ?? []) {
    for (const p of channel.stock_info ?? []) {
      const qty = parseFloat(p.quantity);
      if (!Number.isFinite(qty) || qty === 0) continue;
      const market = mapMarket(p.market, p.symbol);
      if (!market) continue;
      const cost = parseFloat(p.cost_price);
      out.push({
        id: `lp:pos:${p.symbol}`,
        broker: 'longport',
        market,
        symbol: stripSymbolSuffix(p.symbol),
        name: p.symbol_name,
        shares: qty,
        costBasis: Number.isFinite(cost) && cost > 0 ? cost : undefined,
      });
    }
  }
  return out;
}

export async function fetchLongportCash(
  creds: LongportCreds
): Promise<CashBalance[]> {
  const data = await lpGet<{ list: LpAccountEntry[] }>(
    creds,
    '/v1/asset/account'
  );
  const out: CashBalance[] = [];
  for (const entry of data.list ?? []) {
    for (const cash of entry.cash_infos ?? []) {
      const amount = parseFloat(cash.available_cash);
      if (!Number.isFinite(amount) || amount === 0) continue;
      const currency = mapCurrency(cash.currency);
      if (!currency) continue;
      out.push({
        id: `lp:cash:${currency}`,
        broker: 'longport',
        currency,
        amount,
      });
    }
  }
  return out;
}
