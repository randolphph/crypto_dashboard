import Decimal from 'decimal.js';
import { MARKET_CURRENCY, type EnrichedPosition, type FxRates, type StockQuote } from '@/types/stocks';
import { normalizeOptionPosition, optionContract } from '@/lib/stocks/optionContract';

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const key = (p: Pick<EnrichedPosition, 'market' | 'symbol'>) => `${p.market}:${p.symbol.trim().toUpperCase()}`;
const sum = (values: number[]) => values.reduce((a, b) => a.plus(b), new Decimal(0)).toNumber();
const multiply = (...values: number[]) => values.reduce((a, b) => a.mul(b), new Decimal(1)).toNumber();
export type OptionMoneyness = 'itm' | 'otm' | 'atm';

export interface OptionExposure {
  position: EnrichedPosition;
  contract: ReturnType<typeof optionContract>;
  moneyness: OptionMoneyness | null;
  underlying: StockQuote | null;
  underlyingQuantity: number | null;
  notionalUsd: number | null;
  missing: string[];
}

// Full underlying notional measures contract scale, independently of premium,
// intrinsic value or Delta. Long and short legs remain gross, never netted.
export function deriveOptionExposure(
  positions: EnrichedPosition[], quotes: StockQuote[], fx: FxRates | undefined
): OptionExposure[] {
  return positions.filter(p => p.kind === 'option' && p.shares !== 0).map(raw => {
    const position = normalizeOptionPosition(raw);
    const contract = optionContract(position);
    const underlying = positions.find(p => p.kind !== 'option' && key(p) === key(position) && positive(p.price))
      ?? quotes.find(q => key(q) === key(position) && positive(q.price)) ?? null;
    const currency = underlying?.currency ?? MARKET_CURRENCY[position.market];
    const rate = currency === 'USD' ? 1 : currency === 'CNY' ? fx?.cnyUsd : currency === 'HKD' ? fx?.hkdUsd : fx?.krwUsd;
    const multiplier = positive(position.multiplier) ? position.multiplier : null;
    const quantity = Number.isFinite(position.shares) ? Math.abs(position.shares) : null;
    const underlyingQuantity = multiplier !== null && quantity !== null ? multiply(quantity, multiplier) : null;
    let moneyness: OptionMoneyness | null = null;
    if (underlying && positive(contract.strike) && contract.optionType) {
      const intrinsic = contract.optionType === 'call'
        ? new Decimal(underlying.price).minus(contract.strike)
        : new Decimal(contract.strike).minus(underlying.price);
      moneyness = intrinsic.isZero() ? 'atm' : intrinsic.isPositive() ? 'itm' : 'otm';
    }
    return {
      position, contract, moneyness, underlying, underlyingQuantity,
      notionalUsd: underlyingQuantity !== null && underlying && positive(rate)
        ? multiply(underlyingQuantity, underlying.price, rate) : null,
      missing: [!underlying ? '缺少标的价格' : null, !contract.optionType ? '缺少 Call/Put 类型' : null,
        !positive(contract.strike) ? '缺少行权价' : null, multiplier === null ? '缺少合约乘数' : null,
        !positive(rate) ? '缺少汇率' : null, quantity === null ? '缺少数量' : null].filter((s): s is string => !!s),
    };
  });
}

export function summarizeOptionExposure(rows: OptionExposure[]) {
  const bucket = (items: OptionExposure[]) => ({
    count: items.length,
    atmCount: items.filter(r => r.moneyness === 'atm').length,
    notionalUsd: items.every(r => r.notionalUsd !== null) ? sum(items.map(r => r.notionalUsd!)) : null,
    knownNotionalUsd: sum(items.filter(r => r.notionalUsd !== null).map(r => r.notionalUsd!)),
  });
  return {
    count: rows.length,
    covered: rows.filter(r => r.moneyness !== null && r.notionalUsd !== null).length,
    itm: bucket(rows.filter(r => r.moneyness === 'itm')),
    // ATM has no intrinsic value. Keep the row labelled ATM and disclose its
    // inclusion in the non-intrinsic summary instead of calling it OTM.
    otm: bucket(rows.filter(r => r.moneyness === 'otm' || r.moneyness === 'atm')),
    unclassified: rows.filter(r => r.moneyness === null),
  };
}
