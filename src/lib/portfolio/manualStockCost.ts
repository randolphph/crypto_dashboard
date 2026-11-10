import Decimal from 'decimal.js';
import { normalizeStockSymbol } from './stockSymbol';

export interface ManualStockCost {
  symbol: string;
  // USD per original token unit. For protocol positions quantity is entered
  // explicitly in underlying shares, so sharesPerUnit is always one.
  buyPriceUsd: number;
  sharesPerUnit: number;
  quantity?: number;
}
export interface StockCostValuation {
  source: 'manual';
  buyPriceUsd: number;
  sharesPerUnit: number;
  underlyingShares: number;
  costBasisUsd: number;
  costUsd: number;
  pnlUsd: number | null;
  pnlPct: number | null;
}

export function validateManualStockCost(cost: ManualStockCost): ManualStockCost {
  const symbol = normalizeStockSymbol(cost.symbol);
  if (!Number.isFinite(cost.buyPriceUsd) || cost.buyPriceUsd < 0) throw new Error('请输入不小于 0 的有效买入价');
  if (!Number.isFinite(cost.sharesPerUnit) || cost.sharesPerUnit <= 0) throw new Error('每枚对应股数需大于 0');
  if (cost.quantity !== undefined && (!Number.isFinite(cost.quantity) || cost.quantity <= 0 || cost.sharesPerUnit !== 1)) throw new Error('请输入大于 0 的对应股数');
  return { ...cost, symbol };
}

export function valueManualStockCost(cost: ManualStockCost | undefined, symbol: string | undefined, amount: number | undefined, valueUsd: number, incomplete = false): StockCostValuation | undefined {
  if (!cost || !symbol || cost.symbol !== symbol) return undefined;
  try { validateManualStockCost(cost); } catch { return undefined; }
  const quantity = cost.quantity ?? amount;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return undefined;
  const costUsd = new Decimal(quantity).mul(cost.buyPriceUsd).toNumber();
  const underlyingShares = new Decimal(quantity).mul(cost.sharesPerUnit).toNumber();
  const costBasisUsd = new Decimal(cost.buyPriceUsd).div(cost.sharesPerUnit).toNumber();
  if (![costUsd, underlyingShares, costBasisUsd].every(Number.isFinite) || underlyingShares <= 0) return undefined;
  const pnlUsd = !incomplete && Number.isFinite(valueUsd) ? new Decimal(valueUsd).minus(costUsd).toNumber() : null;
  const pnlPct = pnlUsd !== null && costUsd > 0 ? new Decimal(pnlUsd).div(costUsd).mul(100).toNumber() : null;
  return { source: 'manual', buyPriceUsd: cost.buyPriceUsd, sharesPerUnit: cost.sharesPerUnit, underlyingShares, costBasisUsd, costUsd, pnlUsd, pnlPct };
}
