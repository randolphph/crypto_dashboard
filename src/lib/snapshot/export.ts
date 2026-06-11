'use client';

import type {
  PositionSnapshot,
  SnapshotPayload,
} from '@/types/snapshot';

// Stables that should be treated as cash and excluded from the crypto spot
// bucket. Matches the set used elsewhere; LD-prefix is detected separately.
const STABLECOINS = new Set([
  'USDT', 'USDC', 'USD1', 'DAI', 'FDUSD', 'TUSD', 'BUSD',
  'PYUSD', 'USDP', 'USDD',
]);

function isStable(asset: string): boolean {
  const upper = asset.toUpperCase();
  if (STABLECOINS.has(upper)) return true;
  if (upper.startsWith('LD') && STABLECOINS.has(upper.slice(2))) return true;
  return false;
}

interface SpotHolding {
  account?: string;
  symbol: string;
  qty: number;
  price?: number;
  valueUsd: number;
}

interface PerpHolding {
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  entryPrice?: number;
  markPrice?: number;
  leverage?: number;
  notionalUsd: number;
  pnlUsd?: number;
  pnlPct?: number;
}

interface StockHolding {
  market?: string;
  symbol: string;
  currency: string;
  side: 'long' | 'short';
  qty: number;
  entryPrice?: number;
  price?: number;
  valueUsd: number;
  pnlUsd?: number;
  pnlPct?: number;
  changePct?: number;
}

interface OptionHolding {
  market?: string;
  underlying: string;
  symbol: string;
  optionType: 'put' | 'call';
  strike?: number;
  expiry?: string;
  currency: string;
  side: 'long' | 'short';
  qty: number;
  entryPrice?: number;
  price?: number;
  underlyingSpot?: number;
  // spot / strike. AI reads: call ITM when >1, put ITM when <1.
  moneyness?: number;
  valueUsd: number;
  pnlUsd?: number;
  pnlPct?: number;
}

interface VenueExport {
  spotNonStable?: SpotHolding[];
  perps?: PerpHolding[];
  stocks?: StockHolding[];
  options?: OptionHolding[];
  accountValueUsd?: number;
}

export interface AiSummary {
  byCategory: {
    stocksLongUsd: number;
    stocksShortUsd: number;
    cryptoSpotUsd: number;
    cryptoPerpsLongUsd: number;
    cryptoPerpsShortUsd: number;
    optionsValueUsd: number;
    deribitEquityUsd: number;
    cashImpliedUsd: number;
  };
  byVenue: Record<string, number>;
  byUnderlying: Array<{
    underlying: string;
    spotUsd: number;
    perpLongUsd: number;
    perpShortUsd: number;
    optionsUsd: number;
    netUsd: number;
  }>;
}

export interface AiSnapshotExport {
  context: string;
  wallet: string;
  timestamp: number;
  iso: string;
  totalUsd: number;
  fx?: {
    cnyUsd?: number;
    hkdUsd?: number;
    krwUsd?: number;
  };
  summary: AiSummary;
  venues: Record<string, VenueExport>;
  notes: string[];
}

// Display order: crypto venues first, then brokers. Empty venues are dropped
// from the final output entirely so the AI doesn't waste tokens parsing them.
const VENUE_ORDER = [
  'binance',
  'okx',
  'deribit',
  'onchain',
  'ibkr',
  'longport',
  'ths',
] as const;

function ensureVenue(
  venues: Record<string, VenueExport>,
  name: string
): VenueExport {
  if (!venues[name]) venues[name] = {};
  return venues[name];
}

// PnL as a fraction of entry. For longs: (now - entry) / entry. For shorts:
// (entry - now) / entry. Returns rounded to 4 decimals for compact JSON.
function pnlPct(
  side: 'long' | 'short' | undefined,
  entry: number | undefined,
  now: number | undefined
): number | undefined {
  if (entry == null || now == null || entry <= 0) return undefined;
  const raw = side === 'short' ? (entry - now) / entry : (now - entry) / entry;
  if (!Number.isFinite(raw)) return undefined;
  return Math.round(raw * 10000) / 10000;
}

// Deribit options are priced in the underlying (e.g. BTC). valueLocal is
// mark_price × |size| in BTC; valueUsd folds in the underlying spot. So
// spot = valueUsd / valueLocal — recover it after the fact.
function deribitUnderlyingSpot(
  p: PositionSnapshot
): number | undefined {
  if (p.source !== 'deribit') return undefined;
  if (
    p.valueLocal == null ||
    p.valueLocal === 0 ||
    p.valueUsd == null ||
    p.valueUsd === 0
  )
    return undefined;
  const spot = p.valueUsd / p.valueLocal;
  return Number.isFinite(spot) && spot > 0 ? spot : undefined;
}

function pushStock(p: PositionSnapshot, v: VenueExport): void {
  const side: 'long' | 'short' = p.side ?? (p.qty >= 0 ? 'long' : 'short');
  v.stocks ??= [];
  v.stocks.push({
    market: p.market,
    symbol: p.symbol,
    currency: p.currency,
    side,
    qty: Math.abs(p.qty),
    entryPrice: p.entryPrice,
    price: p.priceLocal,
    valueUsd: p.valueUsd,
    pnlUsd: p.pnlUsd,
    pnlPct: pnlPct(side, p.entryPrice, p.priceLocal),
    changePct: p.changePct,
  });
}

function pushOption(
  p: PositionSnapshot,
  v: VenueExport,
  underlyingSpot: number | undefined
): void {
  const side: 'long' | 'short' = p.side ?? (p.qty >= 0 ? 'long' : 'short');
  const moneyness =
    underlyingSpot != null && p.strike != null && p.strike > 0
      ? Math.round((underlyingSpot / p.strike) * 1000) / 1000
      : undefined;
  v.options ??= [];
  v.options.push({
    market: p.market,
    underlying: p.underlying ?? p.symbol,
    symbol: p.symbol,
    optionType: p.optionType ?? 'call',
    strike: p.strike,
    expiry: p.expiry,
    currency: p.currency,
    side,
    qty: Math.abs(p.qty),
    entryPrice: p.entryPrice,
    price: p.priceLocal,
    underlyingSpot,
    moneyness,
    valueUsd: p.valueUsd,
    pnlUsd: p.pnlUsd,
    pnlPct: pnlPct(side, p.entryPrice, p.priceLocal),
  });
}

function pushPerp(p: PositionSnapshot, v: VenueExport): void {
  const side: 'long' | 'short' = p.side ?? (p.qty >= 0 ? 'long' : 'short');
  v.perps ??= [];
  v.perps.push({
    symbol: p.symbol,
    side,
    qty: Math.abs(p.qty),
    entryPrice: p.entryPrice,
    markPrice: p.markPrice ?? p.priceLocal,
    leverage: p.leverage,
    notionalUsd: p.valueUsd,
    pnlUsd: p.pnlUsd,
    pnlPct: pnlPct(side, p.entryPrice, p.markPrice ?? p.priceLocal),
  });
}

function pushSpot(p: PositionSnapshot, v: VenueExport): void {
  v.spotNonStable ??= [];
  v.spotNonStable.push({
    account: p.account,
    symbol: p.symbol,
    qty: p.qty,
    price: p.priceLocal,
    valueUsd: p.valueUsd,
  });
}

// For IBKR/LongPort options, the option's symbol equals the underlying ticker.
// Build a map (source, symbol) → spot price so options can pick up the spot
// from the matching stock position.
function buildStockSpotMap(
  positions: PositionSnapshot[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of positions) {
    if (p.kind !== 'stock' || p.priceLocal == null) continue;
    m.set(`${p.source}:${p.symbol}`, p.priceLocal);
  }
  return m;
}

// Normalise a venue's identifier into the underlying it represents. e.g.
// BTCUSDT → BTC, BTC-25SEP25-50000-P → BTC. Stocks return their symbol as-is.
function underlyingFor(p: PositionSnapshot): string {
  if (p.underlying) return p.underlying;
  if (p.kind === 'crypto_perp') {
    return p.symbol
      .replace(/USDT$|USDC$|USD$|BUSD$|PERP$|PERPETUAL$/i, '')
      .replace(/-$/, '');
  }
  return p.symbol;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function buildSummary(
  snapshot: SnapshotPayload,
  venues: Record<string, VenueExport>
): AiSummary {
  const byCategory = {
    stocksLongUsd: 0,
    stocksShortUsd: 0,
    cryptoSpotUsd: 0,
    cryptoPerpsLongUsd: 0,
    cryptoPerpsShortUsd: 0,
    optionsValueUsd: 0,
    deribitEquityUsd: 0,
    cashImpliedUsd: 0,
  };
  const byVenue: Record<string, number> = {};
  const underlying = new Map<
    string,
    { spotUsd: number; perpLongUsd: number; perpShortUsd: number; optionsUsd: number }
  >();
  const getU = (u: string) => {
    let row = underlying.get(u);
    if (!row) {
      row = { spotUsd: 0, perpLongUsd: 0, perpShortUsd: 0, optionsUsd: 0 };
      underlying.set(u, row);
    }
    return row;
  };

  // Two passes intentionally separate, because byCategory needs the same
  // filters as the venue detail (skip cash/stable so it doesn't double-count
  // into "cryptoSpot") but byVenue must sum *everything* so the subtotal
  // matches what the user sees on the dashboard for that venue.
  for (const p of snapshot.positions) {
    // Categorised buckets — skip cash/stable/defi/deribit-non-option.
    const skipForCategory =
      p.kind === 'cash' ||
      p.kind === 'defi' ||
      ((p.kind === 'crypto' || p.kind === 'token') && isStable(p.symbol)) ||
      (p.source === 'deribit' && p.kind !== 'option');

    if (!skipForCategory) {
      const side: 'long' | 'short' = p.side ?? (p.qty >= 0 ? 'long' : 'short');
      const u = underlyingFor(p);

      if (p.kind === 'stock') {
        if (side === 'short') byCategory.stocksShortUsd += p.valueUsd;
        else byCategory.stocksLongUsd += p.valueUsd;
      } else if (p.kind === 'option') {
        byCategory.optionsValueUsd += p.valueUsd;
        getU(u).optionsUsd += p.valueUsd;
      } else if (p.kind === 'crypto_perp') {
        if (side === 'long') {
          byCategory.cryptoPerpsLongUsd += p.valueUsd;
          getU(u).perpLongUsd += p.valueUsd;
        } else {
          byCategory.cryptoPerpsShortUsd += p.valueUsd;
          getU(u).perpShortUsd += p.valueUsd;
        }
      } else if (p.kind === 'crypto' || p.kind === 'token') {
        byCategory.cryptoSpotUsd += p.valueUsd;
        getU(u).spotUsd += p.valueUsd;
      }
    }

    // Venue subtotal — sum ALL positions per source, including stables and
    // cash, because the user wants the dashboard-equivalent venue total.
    // Skip crypto_perp (its notional double-counts the margin already in the
    // futures sub-account balance). Deribit handled below from API equity.
    if (p.source !== 'deribit' && p.kind !== 'crypto_perp') {
      byVenue[p.source] = (byVenue[p.source] ?? 0) + p.valueUsd;
    }
  }

  if (snapshot.portfolio.deribitTotalUsd != null) {
    byCategory.deribitEquityUsd = snapshot.portfolio.deribitTotalUsd;
    byVenue.deribit = snapshot.portfolio.deribitTotalUsd;
  }

  // Cash implied = total minus everything we listed. Doesn't include Deribit
  // because deribitEquityUsd already represents the whole venue.
  const categorised =
    byCategory.stocksLongUsd +
    byCategory.stocksShortUsd +
    byCategory.cryptoSpotUsd +
    byCategory.cryptoPerpsLongUsd -
    byCategory.cryptoPerpsShortUsd + // perp short reduces directional exposure but balance is still tied up
    byCategory.optionsValueUsd +
    byCategory.deribitEquityUsd;
  byCategory.cashImpliedUsd = snapshot.portfolio.totalUsd - categorised;

  // Round and sort underlyings by absolute net exposure for compact JSON.
  const byUnderlying = Array.from(underlying.entries())
    .map(([u, r]) => ({
      underlying: u,
      spotUsd: round2(r.spotUsd),
      perpLongUsd: round2(r.perpLongUsd),
      perpShortUsd: round2(r.perpShortUsd),
      optionsUsd: round2(r.optionsUsd),
      netUsd: round2(
        r.spotUsd + r.perpLongUsd - r.perpShortUsd + r.optionsUsd
      ),
    }))
    .sort((a, b) => Math.abs(b.netUsd) - Math.abs(a.netUsd));

  return {
    byCategory: {
      stocksLongUsd: round2(byCategory.stocksLongUsd),
      stocksShortUsd: round2(byCategory.stocksShortUsd),
      cryptoSpotUsd: round2(byCategory.cryptoSpotUsd),
      cryptoPerpsLongUsd: round2(byCategory.cryptoPerpsLongUsd),
      cryptoPerpsShortUsd: round2(byCategory.cryptoPerpsShortUsd),
      optionsValueUsd: round2(byCategory.optionsValueUsd),
      deribitEquityUsd: round2(byCategory.deribitEquityUsd),
      cashImpliedUsd: round2(byCategory.cashImpliedUsd),
    },
    byVenue: Object.fromEntries(
      Object.entries(byVenue).map(([k, v]) => [k, round2(v)])
    ),
    byUnderlying,
  };
}

const CONTEXT_PROSE = [
  '这是一份资产快照，用于让 AI 帮你做组合分析。',
  '范围：股票多空（IBKR / 长桥 / 同花顺），看跌+看涨期权（IBKR / Deribit），加密合约多空（Binance），非稳定币现货（Binance / OKX / 链上）。',
  '已排除：稳定币（视为现金 / 保证金）、链上 DeFi、收据 token。现金为隐含值：totalUsd - 已分类持仓之和。',
  'Deribit 是跨币种 USDT 抵押的期权账户，accountValueUsd 是 API 直接算的 equity（不要再加 USDT 余额）。',
  '建议关注：(1) 净敞口结构（多空是否对冲均衡）；(2) 单一标的集中度；(3) 期权对冲的覆盖范围；(4) 杠杆水平。',
].join(' ');

// Transforms a stored snapshot into an LLM-friendly export. Output is grouped
// by venue (source). Per-venue policy:
//   binance / okx / onchain — non-stable spot + perp longs/shorts
//   deribit                 — accountValueUsd (API-reported equity) + options
//                             only; all balances and perps are dropped per
//                             user since their account is cross-margin-USDT
//   ibkr / longport / ths   — stocks (long/short) + options
// Always dropped: cash rows, stables (treated as cash/collateral), DeFi
// rollups, on-chain stable receipt tokens.
export function snapshotToAiJson(snapshot: SnapshotPayload): AiSnapshotExport {
  const venues: Record<string, VenueExport> = {};
  const stockSpotMap = buildStockSpotMap(snapshot.positions);
  let oldFormatCount = 0;

  for (const p of snapshot.positions) {
    if (p.source === 'deribit') {
      if (p.kind === 'option') {
        const v = ensureVenue(venues, 'deribit');
        pushOption(p, v, deribitUnderlyingSpot(p));
        if (p.optionType == null) oldFormatCount++;
      }
      continue;
    }

    if (p.kind === 'cash' || p.kind === 'defi') continue;
    if ((p.kind === 'crypto' || p.kind === 'token') && isStable(p.symbol))
      continue;

    const v = ensureVenue(venues, p.source);
    if (p.kind === 'stock') {
      pushStock(p, v);
      if (p.side == null) oldFormatCount++;
    } else if (p.kind === 'option') {
      const spot = stockSpotMap.get(`${p.source}:${p.underlying ?? p.symbol}`);
      pushOption(p, v, spot);
      if (p.optionType == null) oldFormatCount++;
    } else if (p.kind === 'crypto_perp') {
      pushPerp(p, v);
    } else if (p.kind === 'crypto' || p.kind === 'token') {
      pushSpot(p, v);
    }
  }

  // Stamp Deribit's account total even when no option positions exist (the
  // venue would otherwise be missing entirely).
  if (snapshot.portfolio.deribitTotalUsd != null) {
    const v = ensureVenue(venues, 'deribit');
    v.accountValueUsd = snapshot.portfolio.deribitTotalUsd;
  }

  // Order venues per VENUE_ORDER, dropping empty ones.
  const ordered: Record<string, VenueExport> = {};
  for (const name of VENUE_ORDER) {
    const v = venues[name];
    if (!v) continue;
    const empty =
      !v.spotNonStable?.length &&
      !v.perps?.length &&
      !v.stocks?.length &&
      !v.options?.length &&
      v.accountValueUsd == null;
    if (!empty) ordered[name] = v;
  }
  // Any unrecognised source not in VENUE_ORDER, append at end.
  for (const name of Object.keys(venues)) {
    if (!(name in ordered) && venues[name]) ordered[name] = venues[name];
  }

  const notes: string[] = [];
  if (oldFormatCount > 0) {
    notes.push(
      `${oldFormatCount} 行使用了旧快照格式 (缺 side / optionType / entryPrice)。手动重新快照即可补齐。`
    );
  }

  return {
    context: CONTEXT_PROSE,
    wallet: snapshot.wallet,
    timestamp: snapshot.timestamp,
    iso: new Date(snapshot.timestamp).toISOString(),
    totalUsd: round2(snapshot.portfolio.totalUsd),
    fx:
      snapshot.portfolio.fxCnyUsd != null ||
      snapshot.portfolio.fxHkdUsd != null ||
      snapshot.portfolio.fxKrwUsd != null
        ? {
            cnyUsd: snapshot.portfolio.fxCnyUsd,
            hkdUsd: snapshot.portfolio.fxHkdUsd,
            krwUsd: snapshot.portfolio.fxKrwUsd,
          }
        : undefined,
    summary: buildSummary(snapshot, ordered),
    venues: ordered,
    notes,
  };
}

// ============================================================================
// Markdown export — same data, written as a PM-style report. LLMs tend to do
// better with structured prose + tables than nested JSON for analysis tasks.
// ============================================================================

// Prepended verbatim to the markdown export so the user can paste the file
// straight into any LLM and get a structured analysis without re-typing
// instructions. The prompt is intentionally locked here (not parameterised)
// so the report's expectations stay stable across exports.
const ANALYSIS_PROMPT = `你是一名严谨的个人资产分析师、数据分析师和报告撰写助手。
我会提供一份 Markdown 文档,里面包含我的详细资产数据。请你基于该文档进行数据提取、计算、资产分析、市场环境分析,并生成一份结构专业、可读性强、带可视化图表的 PDF 报告。

重要要求:

1. 只基于我提供的 Markdown 资产数据进行个人资产分析,不要编造不存在的资产、账户或金额。
2. 你可以联网核实当前市场环境,但必须使用可靠来源,并在报告中标注信息来源和日期。
3. 当前市场信息必须尽量使用最新数据,不能只依赖模型记忆。
4. 所有投资和仓位建议必须以"风险分析"和"情景建议"的形式呈现,不要给出绝对化、保证收益式结论。
5. 如果数据中缺少成本、收益率、风险偏好、年龄、现金流、负债期限等关键信息,请明确列入"假设与限制"。
6. 输出最终结果为 PDF 文档。如果你的环境不能直接生成 PDF,请先生成适合导出为 PDF 的完整 Markdown 或 HTML 报告,并说明如何导出。
7. 报告使用中文,语气专业、克制、数据驱动。

请完成以下任务:

一、解析 Markdown 资产数据

请从我提供的 Markdown 文档中提取并结构化以下信息:

- 总资产
- 总负债
- 净资产
- 现金及类现金资产
- 股票、基金、债券、加密资产、房产、养老金、其他资产
- 各账户资产
- 各币种资产
- 各资产的金额、占比、成本、浮盈浮亏、收益率
- 如果有历史数据,请提取不同日期的净资产变化
- 如果有备注、风险说明、目标仓位,也请纳入分析

如果 Markdown 中的字段命名不统一,请自行归一化字段,并说明处理方式。

二、数据质量检查

请检查:

- 是否存在金额缺失、重复记录、币种混用、日期不一致
- 是否存在资产分类不清晰的问题
- 是否存在异常大的资产变化
- 是否存在持仓市值和总资产不匹配的问题
- 是否有影响分析准确性的缺失字段

请用表格列出发现的问题、影响和建议修正方式。

三、资产概览分析

请计算并展示:

- 总资产、总负债、净资产
- 各资产类别金额和占比
- 各账户金额和占比
- 各币种金额和占比
- 流动性资产占比
- 风险资产占比
- 单一资产或单一账户集中度
- 如果有历史数据,展示净资产变化趋势、资产配置变化趋势

四、可视化图表要求

请在 PDF 报告中加入必要的数据可视化。至少包括:

1. 资产类别配置图
   展示现金、股票、基金、债券、房产、加密资产、其他资产的占比。

2. 账户分布图
   展示不同账户或平台的资产分布。

3. 币种敞口图
   展示不同币种资产的金额和占比。

4. 风险资产 vs 稳健资产占比图
   将资产按风险等级分组展示。

5. 集中度分析图
   展示前 5 大资产、账户或持仓占总资产比例。

6. 如果有历史数据,请增加净资产趋势图和资产配置变化图。

图表应清晰、适合 PDF 阅读,不要过度装饰。每张图都要有标题、单位和简短解读。

五、结合当前市场环境分析

请联网核实当前市场环境,并分析这些环境对我的资产配置可能产生的影响。

请重点关注:

- 当前利率环境
- 通胀环境
- 股票市场估值和风险偏好
- 债券收益率环境
- 主要货币走势
- 房地产市场环境
- 黄金或大宗商品环境
- 加密资产市场环境
- 全球宏观风险和政策风险

要求:

- 每个市场判断都要注明数据来源和日期。
- 不要使用过时市场信息。
- 如果不同来源观点冲突,请说明分歧,而不是只选择单一观点。

六、资产风险分析

请结合我的资产数据和当前市场环境,分析:

- 现金比例是否合理
- 风险资产占比是否过高或过低
- 单一资产、行业、国家、币种或账户是否过度集中
- 是否存在流动性不足问题
- 是否存在汇率风险
- 是否存在高波动资产风险
- 是否存在负债压力
- 是否需要建立或提高应急现金储备
- 当前资产配置在不同市场情景下的潜在风险

七、仓位建议

请基于数据和市场环境,给出仓位建议,但必须采用"情景化建议",不要给出绝对买卖指令。

请至少提供三种方案:

1. 保守方案
   目标是降低波动、提高现金流安全性和流动性。

2. 均衡方案
   目标是在风险可控的前提下维持长期增长。

3. 进取方案
   目标是提高长期收益潜力,但要明确承担的波动和回撤风险。

每个方案请包括:

- 现金及类现金目标占比
- 股票/权益类资产目标占比
- 债券/固收类资产目标占比
- 房产或非流动资产目标占比
- 黄金/大宗商品/另类资产目标占比
- 加密资产目标占比,如适用
- 调仓优先级
- 哪些仓位需要减少
- 哪些仓位可以观察或逐步增加
- 调仓时需要注意的风险

请明确说明:这些建议是基于当前数据和假设的分析,不构成个性化投资、法律或税务建议。

八、行动清单

请输出一个可执行的行动清单,分为:

- 本周可以做的事
- 本月可以做的事
- 未来 3-6 个月持续观察的事

行动清单应具体、可操作,例如:

- 核实某项数据
- 降低某类资产集中度
- 增加应急现金储备
- 重新分类某些资产
- 设定目标仓位区间
- 每月跟踪某些指标

九、PDF 报告结构

请最终生成一份 PDF 报告,结构如下:

1. 封面
   - 报告标题
   - 生成日期
   - 数据日期
   - 简短免责声明

2. 执行摘要
   - 5-8 条最重要结论

3. 资产总览
   - 核心指标表
   - 资产类别分布
   - 账户分布
   - 币种分布

4. 数据质量检查
   - 问题、影响、建议

5. 可视化分析
   - 资产配置图
   - 账户分布图
   - 币种敞口图
   - 集中度图
   - 历史趋势图,如数据支持

6. 当前市场环境
   - 宏观环境
   - 股票市场
   - 债券和利率
   - 汇率
   - 房地产
   - 黄金/商品
   - 加密资产,如相关

7. 风险分析
   - 集中度风险
   - 流动性风险
   - 汇率风险
   - 回撤风险
   - 负债风险

8. 仓位建议
   - 保守方案
   - 均衡方案
   - 进取方案
   - 推荐采用哪一种方案,以及原因

9. 行动清单
   - 本周
   - 本月
   - 未来 3-6 个月

10. 假设与限制
    - 数据限制
    - 市场数据限制
    - 分析口径限制

11. 信息来源
    - 列出所有联网核实的数据来源、链接和访问日期

---

下面是我的资产数据（Markdown 格式）：
`;

const VENUE_LABELS: Record<string, string> = {
  binance: 'Binance',
  okx: 'OKX',
  deribit: 'Deribit',
  onchain: '链上钱包',
  ibkr: 'IBKR',
  longport: '长桥 (LongPort)',
  ths: '同花顺 (A股)',
};

function fmtUsd(n: number | null | undefined, withSign = false): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : withSign ? '+' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${sign}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtPct(n: number | undefined, withSign = true): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const v = n * 100;
  const sign = v >= 0 && withSign ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function fmtNum(n: number | undefined, digits = 4): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000)
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toFixed(digits).replace(/\.?0+$/, '');
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

// Renders directly from snapshot.positions (not the filtered AI JSON) so the
// row sums match the venue subtotal — i.e. stables / cash are listed too,
// the way the dashboard tabs show them. Deribit gets special treatment per
// the user's setup (cross-margin USDT, just show equity + options).
export function snapshotToMarkdown(snapshot: SnapshotPayload): string {
  const lines: string[] = [];
  const iso = new Date(snapshot.timestamp).toISOString();

  lines.push(ANALYSIS_PROMPT);
  lines.push('');

  lines.push(`# 资产快照 · ${iso.slice(0, 16).replace('T', ' ')} UTC`);
  lines.push('');
  lines.push(`**总资产**：${fmtUsd(snapshot.portfolio.totalUsd)}`);
  lines.push('');

  // Group positions by source.
  const bySource = new Map<string, PositionSnapshot[]>();
  for (const p of snapshot.positions) {
    if (!bySource.has(p.source)) bySource.set(p.source, []);
    bySource.get(p.source)!.push(p);
  }

  const seen = new Set<string>();
  for (const name of VENUE_ORDER) {
    const list = bySource.get(name);
    if (!list || list.length === 0) continue;
    seen.add(name);
    renderVenue(name, list, snapshot, lines);
  }
  for (const [name, list] of bySource) {
    if (seen.has(name)) continue;
    renderVenue(name, list, snapshot, lines);
  }

  return lines.join('\n');
}

function renderVenue(
  name: string,
  positions: PositionSnapshot[],
  snapshot: SnapshotPayload,
  lines: string[]
): void {
  // Subtotal mirrors the dashboard tab total: sum every position's valueUsd
  // *except* crypto_perp (its notional double-counts the margin already in
  // the wallet balance). Deribit uses the API equity directly.
  let subtotal = 0;
  for (const p of positions) {
    if (p.kind === 'crypto_perp') continue;
    subtotal += p.valueUsd;
  }
  if (name === 'deribit' && snapshot.portfolio.deribitTotalUsd != null) {
    subtotal = snapshot.portfolio.deribitTotalUsd;
  }

  lines.push(`## ${VENUE_LABELS[name] ?? name} · ${fmtUsd(subtotal)}`);
  lines.push('');

  // Deribit-specific render: API equity + options only, drop everything else.
  if (name === 'deribit') {
    const options = positions.filter((p) => p.kind === 'option');
    if (options.length > 0) renderOptions(options, lines);
    else lines.push('（无未平期权）\n');
    return;
  }

  // Group balance-ish positions (cash + crypto + token + defi) by account
  // so the Binance sub-accounts and on-chain wallets are visible. Stable and
  // non-stable land in the same table — what matters is the user can see
  // every line item add up to the subtotal.
  const balances = positions.filter(
    (p) =>
      p.kind === 'cash' ||
      p.kind === 'crypto' ||
      p.kind === 'token' ||
      p.kind === 'defi'
  );
  if (balances.length > 0) renderBalances(balances, lines);

  const perps = positions.filter((p) => p.kind === 'crypto_perp');
  if (perps.length > 0) renderPerps(perps, lines);

  const stocks = positions.filter((p) => p.kind === 'stock');
  if (stocks.length > 0) renderStocks(stocks, lines);

  const stockSpotMap = buildStockSpotMap(positions);
  const options = positions.filter((p) => p.kind === 'option');
  if (options.length > 0)
    renderOptions(options, lines, (p) =>
      stockSpotMap.get(`${p.source}:${p.underlying ?? p.symbol}`)
    );
}

function renderBalances(
  balances: PositionSnapshot[],
  lines: string[]
): void {
  // Group by account label for venues with sub-accounts (Binance, onchain).
  const groups = new Map<string, PositionSnapshot[]>();
  for (const p of balances) {
    const key = p.account ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  for (const [account, rows] of groups) {
    const label = account ? `**${account}**` : '**余额**';
    const sum = rows.reduce((s, p) => s + p.valueUsd, 0);
    lines.push(`${label}（${fmtUsd(sum)}）`);
    lines.push(
      table(
        ['标的', '数量', '价格', 'USD'],
        rows
          .sort((a, b) => b.valueUsd - a.valueUsd)
          .map((p) => [
            p.symbol,
            fmtNum(p.qty),
            fmtNum(p.priceLocal),
            fmtUsd(p.valueUsd),
          ])
      )
    );
    lines.push('');
  }
}

function renderPerps(perps: PositionSnapshot[], lines: string[]): void {
  lines.push('**永续合约**');
  lines.push(
    table(
      ['标的', '方向', '数量', '入场', '标记', '杠杆', '名义 USD', '浮盈', 'PnL%'],
      perps.map((p) => {
        const side: 'long' | 'short' =
          p.side ?? (p.qty >= 0 ? 'long' : 'short');
        return [
          p.symbol,
          side === 'long' ? '多' : '空',
          fmtNum(Math.abs(p.qty)),
          fmtNum(p.entryPrice),
          fmtNum(p.markPrice ?? p.priceLocal),
          p.leverage ? `${p.leverage}×` : '—',
          fmtUsd(p.valueUsd),
          fmtUsd(p.pnlUsd, true),
          fmtPct(pnlPct(side, p.entryPrice, p.markPrice ?? p.priceLocal)),
        ];
      })
    )
  );
  lines.push('');
}

function renderStocks(stocks: PositionSnapshot[], lines: string[]): void {
  lines.push('**股票**');
  lines.push(
    table(
      ['标的', '市场', '方向', '数量', '入场', '现价', '币种', 'USD 价值', 'PnL%'],
      stocks.map((p) => {
        const side: 'long' | 'short' =
          p.side ?? (p.qty >= 0 ? 'long' : 'short');
        return [
          p.symbol,
          p.market ?? '',
          side === 'long' ? '多' : '空',
          fmtNum(Math.abs(p.qty)),
          fmtNum(p.entryPrice),
          fmtNum(p.priceLocal),
          p.currency,
          fmtUsd(p.valueUsd),
          fmtPct(pnlPct(side, p.entryPrice, p.priceLocal)),
        ];
      })
    )
  );
  lines.push('');
}

function renderOptions(
  options: PositionSnapshot[],
  lines: string[],
  lookupSpot?: (p: PositionSnapshot) => number | undefined
): void {
  lines.push('**期权**');
  lines.push(
    table(
      ['标的', '类型', '行权', '到期', '方向', '数量', '入场', '现价', '现货', 'Moneyness', 'USD', 'PnL%'],
      options.map((p) => {
        const side: 'long' | 'short' =
          p.side ?? (p.qty >= 0 ? 'long' : 'short');
        const spot =
          p.source === 'deribit'
            ? deribitUnderlyingSpot(p)
            : lookupSpot?.(p);
        const moneyness =
          spot != null && p.strike != null && p.strike > 0
            ? spot / p.strike
            : undefined;
        const optionType: 'put' | 'call' = p.optionType ?? 'call';
        return [
          p.underlying ?? p.symbol,
          optionType === 'put' ? 'P' : 'C',
          fmtNum(p.strike),
          p.expiry ?? '—',
          side === 'long' ? '多' : '空',
          fmtNum(Math.abs(p.qty)),
          fmtNum(p.entryPrice),
          fmtNum(p.priceLocal),
          fmtNum(spot),
          moneyness != null
            ? `${moneyness.toFixed(2)}${moneynessTag(optionType, moneyness)}`
            : '—',
          fmtUsd(p.valueUsd),
          fmtPct(pnlPct(side, p.entryPrice, p.priceLocal)),
        ];
      })
    )
  );
  lines.push('');
}

function moneynessTag(
  type: 'put' | 'call',
  m: number | undefined
): string {
  if (m == null) return '';
  // spot/strike. Call ITM when >1; put ITM when <1.
  const itm = type === 'call' ? m > 1.02 : m < 0.98;
  const atm = m > 0.98 && m < 1.02;
  return atm ? ' (ATM)' : itm ? ' (ITM)' : ' (OTM)';
}

export function downloadText(
  content: string,
  filename: string,
  mime = 'text/plain'
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Parse imported JSON. Accepts either a SnapshotPayload (raw store dump from
// our previous full.json format) or an array of them. Best-effort validation —
// rows missing required fields are dropped silently.
export function parseSnapshotsJson(text: string): SnapshotPayload[] {
  const data: unknown = JSON.parse(text);
  const list = Array.isArray(data) ? data : [data];
  const out: SnapshotPayload[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (
      typeof o.wallet === 'string' &&
      typeof o.timestamp === 'number' &&
      Array.isArray(o.positions) &&
      o.portfolio &&
      typeof o.portfolio === 'object'
    ) {
      out.push(o as unknown as SnapshotPayload);
    }
  }
  return out;
}
