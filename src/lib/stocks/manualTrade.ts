import Decimal from 'decimal.js';
import type { CashBalance, StockPosition } from '@/types/stocks';
import type { LedgerAccount, LedgerActivity } from '@/types/ledger';

export interface ManualAShareTrade {
  transactionId: string;
  accountId: string;
  positionId?: string;
  symbol: string;
  name?: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  occurredAt: number;
  commission: number;
  tax: number;
  otherFee: number;
}

export interface AShareTradePlan {
  positions: StockPosition[];
  cash: CashBalance[];
  activity: LedgerActivity;
  cashDelta: number;
}

export function planAShareTrade(positions: StockPosition[], cash: CashBalance[], accounts: LedgerAccount[], input: ManualAShareTrade, recordedAt: number): AShareTradePlan {
  if (!input.transactionId || !Number.isFinite(input.occurredAt) || !Number.isFinite(new Date(input.occurredAt).getTime())) throw new Error('请填写有效成交时间');
  const account = accounts.find((a) => a.id === input.accountId && a.platform === 'ths' && a.enabled && a.syncMode === 'manual');
  if (!account) throw new Error('请选择可用的 A 股手工账本账户');
  const symbol = input.symbol.trim().replace(/^(sh|sz|bj)/i, '');
  if (!/^\d{6}$/.test(symbol)) throw new Error('A 股代码需为 6 位数字');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('数量需为正整数');
  if (!Number.isFinite(input.price) || input.price <= 0) throw new Error('成交价格需大于 0');
  if (![input.commission, input.tax, input.otherFee].every((fee) => Number.isFinite(fee) && fee >= 0)) throw new Error('费用需为大于或等于 0 的有效金额');
  if (input.side !== 'buy' && input.side !== 'sell') throw new Error('交易方向无效');
  const candidates = positions.filter((p) => p.broker === 'ths' && p.market === 'A' && p.symbol.replace(/^(sh|sz|bj)/i, '').trim() === symbol);
  const position = input.positionId ? candidates.find((p) => p.id === input.positionId) : candidates.find((p) => (p.ledgerAccountId ?? account.id) === account.id);
  if (input.positionId && !position) throw new Error('持仓已变化，请重新选择');
  if (position?.ledgerAccountId && position.ledgerAccountId !== account.id) throw new Error('所选账本账户与持仓不一致');
  if (position && (position.shares < 0 || (position.multiplier ?? 1) !== 1 || position.kind === 'option')) throw new Error('此入口仅支持 A 股多头股票交易');
  const before = position?.shares ?? 0;
  if (input.side === 'sell' && (!position || input.quantity > before)) throw new Error(`持仓仅 ${before} 股`);
  const after = new Decimal(before).plus(input.side === 'buy' ? input.quantity : -input.quantity).toNumber();
  const notional = new Decimal(input.price).times(input.quantity);
  const fees = new Decimal(input.commission).plus(input.tax).plus(input.otherFee);
  const cashDelta = (input.side === 'buy' ? notional.negated() : notional).minus(fees).toNumber();
  const costBasis = input.side === 'buy' ? (position ? position.costBasis === undefined ? undefined : new Decimal(position.costBasis).times(before).plus(notional).div(after).toNumber() : input.price) : position?.costBasis;
  const nextPosition: StockPosition = { ...position, id: position?.id ?? `a-share-position:${input.transactionId}`, broker: 'ths', market: 'A', symbol, name: input.name?.trim() || position?.name, shares: after, costBasis, ledgerAccountId: account.id };
  const nextPositions = position ? positions.flatMap((p) => p.id !== position.id ? [p] : after === 0 ? [] : [nextPosition]) : [...positions, nextPosition];
  const cashRow = cash.find((c) => c.broker === 'ths' && c.currency === 'CNY');
  const nextCashRow: CashBalance = { ...cashRow, id: cashRow?.id ?? `a-share-cash:${input.transactionId}`, broker: 'ths', currency: 'CNY', amount: new Decimal(cashRow?.amount ?? 0).plus(cashDelta).toNumber() };
  const nextCash = cashRow ? cash.map((c) => c.id === cashRow.id ? nextCashRow : c) : [...cash, nextCashRow];
  const operation = input.side === 'buy' ? before === 0 ? 'open' : 'add' : after === 0 ? 'close' : 'reduce';
  return {
    positions: nextPositions, cash: nextCash, cashDelta,
    activity: { id: `a-share-trade:${input.transactionId}`, externalId: `a-share-trade:${input.transactionId}`, accountId: account.id, kind: 'trade', instrumentType: 'stock', market: 'A', symbol, name: nextPosition.name, side: input.side, quantity: input.quantity, price: input.price, currency: 'CNY', multiplier: 1, commission: input.commission, tax: input.tax, otherFee: input.otherFee, occurredAt: input.occurredAt, recordedAt, confirmedAt: recordedAt, positionAfter: after, cashFlow: cashDelta, status: 'confirmed', source: 'manual', operation, note: 'A 股手工录入', executionCount: 1 },
  };
}
