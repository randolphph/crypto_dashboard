import Decimal from 'decimal.js';
import type { GoldHolding, ValuedGoldHolding, GoldQuote } from '@/types/gold';
import { goldQuoteStatus } from '@/lib/gold/quote';
import type { FxRates } from '@/types/stocks';

export function validateGoldHolding(holding: GoldHolding): GoldHolding {
  if (!holding.name.trim()) throw new Error('请填写黄金名称');
  if (!Number.isFinite(holding.grams) || holding.grams <= 0) throw new Error('克数需为大于 0 的有效数字');
  if (!Number.isFinite(holding.buyPricePerGram) || holding.buyPricePerGram <= 0) throw new Error('每克买入价需为大于 0 的有效数字');
  if (!['CNY', 'USD', 'HKD', 'KRW'].includes(holding.currency)) throw new Error('请选择有效币种');
  if (!Number.isFinite(new Decimal(holding.grams).mul(holding.buyPricePerGram).toNumber())) throw new Error('买入总额超出可用范围');
  return { ...holding, name: holding.name.trim() };
}

export function valueGoldHoldings(holdings: GoldHolding[], fx?: FxRates, quote?: GoldQuote, now = Date.now()) {
  const priceStatus = goldQuoteStatus(quote, now);
  const priceCnyPerGram = priceStatus !== 'unavailable' && quote ? quote.price : null;
  const cnyUsd = fx && Number.isFinite(fx.cnyUsd) && fx.cnyUsd > 0 ? fx.cnyUsd : null;
  const priceUsdPerGram = priceCnyPerGram !== null && cnyUsd !== null ? new Decimal(priceCnyPerGram).mul(cnyUsd).toNumber() : null;
  const items: ValuedGoldHolding[] = holdings.map(holding => {
    const costLocal = Number.isFinite(holding.grams) && holding.grams > 0 && Number.isFinite(holding.buyPricePerGram) && holding.buyPricePerGram > 0
      ? new Decimal(holding.grams).mul(holding.buyPricePerGram).toNumber() : NaN;
    const rate = holding.currency === 'USD' ? 1 : holding.currency === 'CNY' ? fx?.cnyUsd : holding.currency === 'HKD' ? fx?.hkdUsd : holding.currency === 'KRW' ? fx?.krwUsd : undefined;
    const converted = Number.isFinite(costLocal) && rate !== undefined && Number.isFinite(rate) && rate > 0 ? new Decimal(costLocal).mul(rate).toNumber() : NaN;
    const costUsd = Number.isFinite(converted) ? converted : null;
    const costCnyValue = holding.currency === 'CNY' ? costLocal : costUsd !== null && cnyUsd !== null ? new Decimal(costUsd).div(cnyUsd).toNumber() : NaN;
    const costCny = Number.isFinite(costCnyValue) ? costCnyValue : null;
    const marketCnyValue = priceCnyPerGram !== null && Number.isFinite(holding.grams) && holding.grams > 0 ? new Decimal(holding.grams).mul(priceCnyPerGram).toNumber() : NaN;
    const valueCny = Number.isFinite(marketCnyValue) ? marketCnyValue : null;
    const marketValue = priceUsdPerGram !== null && Number.isFinite(holding.grams) && holding.grams > 0 ? new Decimal(holding.grams).mul(priceUsdPerGram).toNumber() : NaN;
    const valueUsd = Number.isFinite(marketValue) ? marketValue : null;
    return { ...holding, costLocal, costUsd, costCny, valueCny, pnlCny: valueCny !== null && costCny !== null ? new Decimal(valueCny).minus(costCny).toNumber() : null, valueUsd, pnlUsd: valueUsd !== null && costUsd !== null ? new Decimal(valueUsd).minus(costUsd).toNumber() : null,
      valuationBasis: valueCny !== null ? 'spot' : 'unavailable',
      ...(priceCnyPerGram !== null && quote && priceStatus !== 'unavailable' ? { priceCnyPerGram, ...(priceUsdPerGram !== null ? { priceUsdPerGram } : {}), priceUpdatedAt: quote.updatedAt, priceSource: quote.source, priceStatus } : {}),
    };
  });
  const complete = items.every(item => item.valueUsd !== null);
  const marketComplete = items.every(item => item.valueCny !== null);
  const costCnyComplete = items.every(item => item.costCny !== null);
  const totalCny = marketComplete ? items.reduce((sum, item) => sum.plus(item.valueCny!), new Decimal(0)).toNumber() : null;
  const totalCostCny = costCnyComplete ? items.reduce((sum, item) => sum.plus(item.costCny!), new Decimal(0)).toNumber() : null;
  const pnlCny = totalCny !== null && totalCostCny !== null ? new Decimal(totalCny).minus(totalCostCny).toNumber() : null;
  const costComplete = items.every(item => item.costUsd !== null);
  const totalCostUsd = costComplete ? items.reduce((sum, item) => sum.plus(item.costUsd!), new Decimal(0)).toNumber() : null;
  const totalUsd = complete ? items.reduce((sum, item) => sum.plus(item.valueUsd!), new Decimal(0)).toNumber() : null;
  const pnlUsd = totalUsd !== null && totalCostUsd !== null ? new Decimal(totalUsd).minus(totalCostUsd).toNumber() : null;
  return {
    items, complete, marketComplete, costComplete, costCnyComplete, priceStatus, priceCnyPerGram, priceUsdPerGram, totalCny, totalCostCny, pnlCny, totalCostUsd, pnlUsd,
    pnlPct: pnlCny !== null && totalCostCny !== null && totalCostCny > 0 ? pnlCny / totalCostCny * 100 : null,
    totalGrams: holdings.reduce((sum, h) => sum.plus(h.grams), new Decimal(0)).toNumber(),
    totalUsd,
  };
}
