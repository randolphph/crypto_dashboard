import {
  DEFAULT_BUDGET_RATIOS,
  isSectorArmed,
  type AccumulationTarget,
  type GateState,
} from '@/types/accumulation';
import type {
  StocksData,
  EnrichedPosition,
  StockQuote,
  StockMarket,
} from '@/types/stocks';

// Within this fraction of an anchor price (or already through it) a tier counts
// as "接近触发" and the row gets flagged — provided the gate/sector is armed.
export const TRIGGER_THRESHOLD = 0.03;

export interface DerivedTier {
  level: 1 | 2 | 3;
  offset: number;
  // price = ma20 * (1 + offset), in the symbol's local currency (same unit as
  // ma20), so it lines up with the live local price.
  price: number;
  ratio: number;
  // remaining * ratio — the USD budget allocated to this rung.
  amount: number;
  // (livePrice − price) / price. ≤ 0 means price is at/through the anchor.
  gapPct: number | null;
  triggered: boolean;
}

export interface DerivedTarget {
  target: AccumulationTarget;
  // Display name from live data (A/HK stocks); null when unknown.
  name: string | null;
  livePrice: number | null;
  // Whether this target is an existing holding in the dashboard feed. Not-held
  // (watch-list) names have currentValue 0 and price sourced from /api/quotes.
  isHeld: boolean;
  currentValue: number;
  // Shared straight from the dashboard's enriched position — only meaningful
  // when held. costBasisLocal is the avg cost per share in local currency.
  pnlUsd: number | null;
  pnlPct: number | null;
  changePct: number | null;
  costBasisLocal: number | null;
  remaining: number;
  progressPct: number;
  tiers: DerivedTier[];
  // 0..1 closeness to the nearest not-yet-triggered tier (1 = at/through an
  // anchor). Independent of the gate so sorting/coloring still works when the
  // gate is closed; `flagged` is the gated version used for the alert state.
  proximity: number;
  nearestTierLevel: 1 | 2 | 3 | null;
  sectorArmed: boolean;
  flagged: boolean;
}

export interface SectorMember {
  symbol: string;
  // Display label (stock name for A/HK, else symbol).
  label: string;
  currentValue: number;
  targetValue: number;
}

export interface SectorRollup {
  sector: string;
  targetValue: number;
  currentValue: number;
  // Every plan target in this sector, sorted by targetValue desc — powers the
  // tooltip that shows both current-holding share and target share per symbol.
  members: SectorMember[];
}

export interface FundingOverview {
  aiCurrentTotal: number;
  aiTargetTotal: number;
  pendingBudget: number; // 待加额度 = Σ remaining
  aiShareOfPortfolio: number; // AI 现值 / 总资产
  availableAmmo: number; // 可用现金（弹药）
  ammoCoverage: number; // 弹药 / 待加额度，Infinity when nothing pending
}

function sameSymbol(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

interface LiveMatch {
  livePrice: number | null;
  isHeld: boolean;
  currentValue: number;
  pnlUsd: number | null;
  pnlPct: number | null;
  changePct: number | null;
  costBasisLocal: number | null;
  name: string | null;
}

// A/HK/KR tickers are opaque numeric codes (600519, 0700, 005930) — show the
// stock name when we have one (from live position data or the watch quote).
// US symbols are letter tickers, so keep those as-is.
export function displayName(
  market: StockMarket,
  symbol: string,
  name?: string | null
): string {
  if (market !== 'US' && name && name.trim()) {
    return name.trim();
  }
  return symbol;
}

function quoteKey(market: StockMarket, symbol: string): string {
  return `${market}:${symbol.trim().toUpperCase()}`;
}

// Join one target to the live stock feed by market:symbol. Everything here is
// SHARED from the dashboard's enriched positions — price, value, unrealized
// PnL, today's change, avg cost — so the加仓 table never re-derives or re-
// fetches what the看板 already has. Value sums every matching row (handles a
// stock + its options sharing a ticker) in USD; the price for proximity is the
// local-currency mark of the largest match so it lines up with ma20.
//
// When the target isn't a holding, we fall back to the supplemental watch quote
// (price only — there's no position, so no value/PnL).
function matchLive(
  target: AccumulationTarget,
  positions: EnrichedPosition[],
  watchQuotes: Map<string, StockQuote>
): LiveMatch {
  const matches = positions.filter(
    (p) => p.market === target.market && sameSymbol(p.symbol, target.symbol)
  );
  if (matches.length === 0) {
    const q = watchQuotes.get(quoteKey(target.market, target.symbol));
    return {
      livePrice: q && q.price > 0 ? q.price : null,
      isHeld: false,
      currentValue: 0,
      pnlUsd: null,
      pnlPct: null,
      changePct: q?.changePct ?? null,
      costBasisLocal: null,
      name: q?.name ?? null,
    };
  }

  const currentValue = matches.reduce((s, p) => s + p.marketValueUsd, 0);
  const priced = matches
    .filter((p) => p.price > 0)
    .sort((a, b) => Math.abs(b.marketValueUsd) - Math.abs(a.marketValueUsd));
  const lead = priced[0];

  const pnlParts = matches.filter((p) => p.pnlUsd !== undefined);
  const pnlUsd = pnlParts.length
    ? pnlParts.reduce((s, p) => s + (p.pnlUsd ?? 0), 0)
    : null;
  // Aggregate cost basis value = current value − unrealized PnL; pct off that.
  const costValueUsd = pnlUsd !== null ? currentValue - pnlUsd : null;
  const pnlPct =
    pnlUsd !== null && costValueUsd && costValueUsd !== 0
      ? (pnlUsd / Math.abs(costValueUsd)) * 100
      : null;

  return {
    livePrice: lead?.price ?? null,
    isHeld: true,
    currentValue,
    pnlUsd,
    pnlPct,
    changePct: lead?.changePct ?? null,
    costBasisLocal: lead?.costBasis ?? null,
    name: lead?.quoteName ?? lead?.name ?? null,
  };
}

export function deriveTarget(
  target: AccumulationTarget,
  positions: EnrichedPosition[],
  gate: GateState,
  watchQuotes: Map<string, StockQuote> = new Map()
): DerivedTarget {
  const {
    livePrice,
    isHeld,
    currentValue,
    pnlUsd,
    pnlPct,
    changePct,
    costBasisLocal,
    name,
  } = matchLive(target, positions, watchQuotes);
  const remaining = Math.max(0, target.targetValue - currentValue);
  const progressPct =
    target.targetValue > 0
      ? Math.min(1, currentValue / target.targetValue)
      : 0;
  const ratios = target.budgetRatios ?? DEFAULT_BUDGET_RATIOS;

  const tiers: DerivedTier[] = target.tierOffsets.map((offset, i) => {
    const price = target.ma20 * (1 + offset);
    const gapPct = livePrice !== null ? (livePrice - price) / price : null;
    return {
      level: (i + 1) as 1 | 2 | 3,
      offset,
      price,
      ratio: ratios[i] ?? 0,
      amount: remaining * (ratios[i] ?? 0),
      gapPct,
      triggered: gapPct !== null && gapPct <= 0,
    };
  });

  // Nearest un-triggered tier = the smallest positive gap (the next anchor the
  // price would hit on the way down). A triggered tier pins proximity to 1.
  let proximity = 0;
  let nearestTierLevel: 1 | 2 | 3 | null = null;
  const anyTriggered = tiers.some((t) => t.triggered);
  if (anyTriggered) {
    proximity = 1;
    nearestTierLevel =
      tiers.filter((t) => t.triggered).at(-1)?.level ?? null;
  } else {
    const upcoming = tiers
      .filter((t) => t.gapPct !== null && t.gapPct > 0)
      .sort((a, b) => (a.gapPct ?? 0) - (b.gapPct ?? 0));
    const nearest = upcoming[0];
    if (nearest && nearest.gapPct !== null) {
      proximity = Math.max(0, 1 - nearest.gapPct / TRIGGER_THRESHOLD);
      nearestTierLevel = nearest.level;
    }
  }

  const sectorArmed = isSectorArmed(gate, target.sector);
  const flagged =
    sectorArmed &&
    target.status === 'active' &&
    (anyTriggered ||
      tiers.some(
        (t) => t.gapPct !== null && t.gapPct > 0 && t.gapPct <= TRIGGER_THRESHOLD
      ));

  return {
    target,
    name,
    livePrice,
    isHeld,
    currentValue,
    pnlUsd,
    pnlPct,
    changePct,
    costBasisLocal,
    remaining,
    progressPct,
    tiers,
    proximity,
    nearestTierLevel,
    sectorArmed,
    flagged,
  };
}

export function deriveTargets(
  targets: AccumulationTarget[],
  stocks: StocksData | undefined,
  gate: GateState,
  watchQuotes: StockQuote[] = []
): DerivedTarget[] {
  const positions = (stocks?.brokers ?? []).flatMap((b) => b.positions);
  const watchMap = new Map<string, StockQuote>();
  for (const q of watchQuotes) watchMap.set(quoteKey(q.market, q.symbol), q);
  return targets.map((t) => deriveTarget(t, positions, gate, watchMap));
}

export interface OrphanHolding {
  market: StockMarket;
  symbol: string;
  name?: string;
  currentValue: number;
  // Local-currency price of the largest matching row — lets the "加入计划"
  // quick-add prefill ma20 with a sensible starting number.
  priceLocal: number | null;
}

// Held stock positions that aren't covered by any plan target — "有仓但不在
// 计划内". Lets the view nudge the user to bring real positions under a plan.
export function orphanHoldings(
  targets: AccumulationTarget[],
  stocks: StocksData | undefined
): OrphanHolding[] {
  const planned = new Set(
    targets.map((t) => quoteKey(t.market, t.symbol))
  );
  const byKey = new Map<string, OrphanHolding>();
  for (const b of stocks?.brokers ?? []) {
    for (const p of b.positions) {
      const key = quoteKey(p.market, p.symbol);
      if (planned.has(key)) continue;
      const row = byKey.get(key) ?? {
        market: p.market,
        symbol: p.symbol,
        name: p.quoteName ?? p.name,
        currentValue: 0,
        priceLocal: null,
      };
      row.currentValue += p.marketValueUsd;
      // Keep the price of whichever leg carries the most value.
      if (
        p.price > 0 &&
        (row.priceLocal === null || p.marketValueUsd > 0)
      ) {
        row.priceLocal = p.price;
      }
      byKey.set(key, row);
    }
  }
  return [...byKey.values()]
    .filter((o) => o.currentValue > 0)
    .sort((a, b) => b.currentValue - a.currentValue);
}

export function rollupSectors(derived: DerivedTarget[]): SectorRollup[] {
  const map = new Map<string, SectorRollup>();
  for (const d of derived) {
    const key = d.target.sector || '未分类';
    const row = map.get(key) ?? {
      sector: key,
      targetValue: 0,
      currentValue: 0,
      members: [],
    };
    row.targetValue += d.target.targetValue;
    row.currentValue += d.currentValue;
    row.members.push({
      symbol: d.target.symbol,
      label: displayName(d.target.market, d.target.symbol, d.name),
      currentValue: d.currentValue,
      targetValue: d.target.targetValue,
    });
    map.set(key, row);
  }
  const out = [...map.values()];
  for (const r of out)
    r.members.sort((a, b) => b.targetValue - a.targetValue);
  return out.sort((a, b) => b.targetValue - a.targetValue);
}

export function deriveFunding(
  derived: DerivedTarget[],
  totalPortfolioUsd: number,
  availableAmmo: number
): FundingOverview {
  const aiCurrentTotal = derived.reduce((s, d) => s + d.currentValue, 0);
  const aiTargetTotal = derived.reduce(
    (s, d) => s + d.target.targetValue,
    0
  );
  const pendingBudget = derived.reduce((s, d) => s + d.remaining, 0);
  return {
    aiCurrentTotal,
    aiTargetTotal,
    pendingBudget,
    aiShareOfPortfolio:
      totalPortfolioUsd > 0 ? aiCurrentTotal / totalPortfolioUsd : 0,
    availableAmmo,
    ammoCoverage:
      pendingBudget > 0 ? availableAmmo / pendingBudget : Infinity,
  };
}
