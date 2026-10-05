import type { WalletBalance } from '@/types/onchain';
import type { DeribitData } from '@/types/deribit';
import { BROKER_LABEL, type StocksData } from '@/types/stocks';
import { completeDeepseekJson } from './deepseek';

export const ECONOMIC_CATEGORIES = [
  '类现金',
  '股票',
  '加密资产',
  '衍生品',
  '其它',
] as const;

export type EconomicCategory = (typeof ECONOMIC_CATEGORIES)[number];

export interface EconomicAllocationDetail {
  label: string;
  value: number;
}

export interface EconomicAllocationBucket {
  label: EconomicCategory;
  value: number;
  details?: EconomicAllocationDetail[];
}

export interface EconomicAllocationCandidate {
  id: string;
  label: string;
  valueUsd: number;
  baseCategory: EconomicCategory;
  description: string;
}

export interface EconomicAllocationInput {
  totalValue: number;
  baseline: EconomicAllocationBucket[];
  candidates: EconomicAllocationCandidate[];
}

export interface EconomicClassification {
  id: string;
  category: EconomicCategory;
  reason: string;
}

export interface EconomicAllocationAnalysis {
  summary: string;
  classifications: EconomicClassification[];
}

interface BreakdownLike {
  label: string;
  value: number;
}

interface CustomAssetLike {
  id: string;
  name: string;
  value: number;
}

interface AssetBalanceLike {
  asset: string;
  usdValue: number;
  chainId?: string;
  dedupedToDefi?: boolean;
}

interface BinanceAccountLike {
  label: string;
  balances?: AssetBalanceLike[];
}

interface BinanceEconomicData {
  configured?: boolean;
  accounts?: BinanceAccountLike[];
}

interface OkxEconomicData {
  configured?: boolean;
  balances?: AssetBalanceLike[];
}

interface BankCashLike {
  id: string;
  bank: string;
  currency: string;
  valueUsd: number;
}

export interface BuildEconomicAllocationInput {
  totalValue: number;
  categoryBreakdown: BreakdownLike[];
  stocks?: StocksData;
  binance?: BinanceEconomicData;
  okx?: OkxEconomicData;
  onchain?: WalletBalance[];
  deribit?: DeribitData;
  bankCash: BankCashLike[];
  customAssets: CustomAssetLike[];
}

const CATEGORY_ORDER = new Map(
  ECONOMIC_CATEGORIES.map((category, index) => [category, index])
);

const STABLECOINS = new Set([
  'USDT',
  'USDC',
  'USD1',
  'DAI',
  'FDUSD',
  'TUSD',
  'BUSD',
  'PYUSD',
  'USDP',
  'USDD',
]);

const BINANCE_CASH_LIKE = new Set(['现货', '理财', '资金账户']);

const CHAIN_LABELS: Record<string, string> = {
  '1': 'Ethereum',
  '10': 'Optimism',
  '56': 'BNB Chain',
  '8453': 'Base',
  '42161': 'Arbitrum',
  '9745': 'Plasma',
  plasma: 'Plasma',
  '4663': 'Robinhood Chain',
  hyperliquid: 'Hyperliquid',
  bitcoin: 'Bitcoin',
  solana: 'Solana',
};

function baselineCategory(label: string): EconomicCategory {
  if (label === '现金') return '类现金';
  if (label === '股票') return '股票';
  if (label === '加密') return '加密资产';
  return '其它';
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isStableAsset(asset: string): boolean {
  const upper = asset.toUpperCase();
  if (STABLECOINS.has(upper)) return true;
  return upper.startsWith('LD') && STABLECOINS.has(upper.slice(2));
}

function assetCategory(asset: string): EconomicCategory {
  return isStableAsset(asset) ? '类现金' : '加密资产';
}

export function buildEconomicAllocationInput({
  totalValue,
  categoryBreakdown,
  stocks,
  binance,
  okx,
  onchain,
  deribit,
  bankCash,
  customAssets,
}: BuildEconomicAllocationInput): EconomicAllocationInput {
  const baselineMap = new Map<EconomicCategory, number>();
  for (const item of categoryBreakdown) {
    const category = baselineCategory(item.label);
    baselineMap.set(category, (baselineMap.get(category) ?? 0) + item.value);
  }

  const candidates: EconomicAllocationCandidate[] = [];

  for (const broker of stocks?.brokers ?? []) {
    for (const position of broker.positions) {
      if (!finitePositive(position.marketValueUsd)) continue;
      const name = position.quoteName || position.name || position.symbol;
      candidates.push({
        id: `stock:${broker.broker}:${position.id}`,
        label: `${position.symbol} · ${name}`,
        valueUsd: position.marketValueUsd,
        baseCategory: '股票',
        description: [
          `券商=${broker.broker}`,
          `市场=${position.market}`,
          `类型=${position.kind ?? 'stock'}`,
          `代码=${position.symbol}`,
          `名称=${name}`,
        ].join('；'),
      });
    }

    for (const cash of broker.cash) {
      if (!finitePositive(cash.amountUsd)) continue;
      candidates.push({
        id: `stock-cash:${broker.broker}:${cash.id}`,
        label: `${BROKER_LABEL[broker.broker]} · ${cash.currency} 现金`,
        valueUsd: cash.amountUsd,
        baseCategory: '类现金',
        description: [
          `位置=${BROKER_LABEL[broker.broker]}`,
          `币种=${cash.currency}`,
          '形态=券商现金余额',
        ].join('；'),
      });
    }
  }

  if (binance?.configured !== false) {
    for (let accountIndex = 0; accountIndex < (binance?.accounts?.length ?? 0); accountIndex += 1) {
      const account = binance?.accounts?.[accountIndex];
      if (!account) continue;
      const cashLike = BINANCE_CASH_LIKE.has(account.label);
      for (let balanceIndex = 0; balanceIndex < (account.balances?.length ?? 0); balanceIndex += 1) {
        const balance = account.balances?.[balanceIndex];
        if (!balance || !finitePositive(balance.usdValue)) continue;
        const baseCategory = cashLike
          ? assetCategory(balance.asset)
          : '加密资产';
        candidates.push({
          id: `exchange:binance:${accountIndex}:${balanceIndex}:${balance.asset}`,
          label: `${balance.asset} · Binance ${account.label}`,
          valueUsd: balance.usdValue,
          baseCategory,
          description: [
            '平台=Binance',
            `账户=${account.label}`,
            `资产=${balance.asset}`,
            cashLike ? '形态=可提取余额' : '形态=合约或策略账户保证金',
          ].join('；'),
        });
      }
    }
  }

  if (okx?.configured !== false) {
    for (let index = 0; index < (okx?.balances?.length ?? 0); index += 1) {
      const balance = okx?.balances?.[index];
      if (!balance || !finitePositive(balance.usdValue)) continue;
      candidates.push({
        id: `exchange:okx:${index}:${balance.asset}`,
        label: `${balance.asset} · OKX`,
        valueUsd: balance.usdValue,
        baseCategory: assetCategory(balance.asset),
        description: [
          '平台=OKX',
          `资产=${balance.asset}`,
          '形态=统一账户余额，缺少子账户用途信息',
        ].join('；'),
      });
    }
  }

  for (const wallet of onchain ?? []) {
    for (let balanceIndex = 0; balanceIndex < wallet.balances.length; balanceIndex += 1) {
      const balance = wallet.balances[balanceIndex];
      if (balance.dedupedToDefi || !finitePositive(balance.usdValue)) continue;
      const chain = balance.chainId
        ? CHAIN_LABELS[balance.chainId] ?? `Chain ${balance.chainId}`
        : wallet.chains.map((item) => CHAIN_LABELS[item] ?? item).join('/');
      candidates.push({
        id: `wallet:${wallet.walletId}:${balanceIndex}:${balance.chainId ?? 'unknown'}:${balance.asset}`,
        label: `${balance.asset} · ${wallet.walletName} · ${chain}`,
        valueUsd: balance.usdValue,
        baseCategory: assetCategory(balance.asset),
        description: [
          '位置=链上钱包',
          `网络=${chain || 'unknown'}`,
          `资产=${balance.asset}`,
          '形态=钱包现货余额',
        ].join('；'),
      });
    }

    const protocols = wallet.defiPositions ?? [];
    for (let protocolIndex = 0; protocolIndex < protocols.length; protocolIndex += 1) {
      const protocol = protocols[protocolIndex];
      for (let positionIndex = 0; positionIndex < protocol.positions.length; positionIndex += 1) {
        const position = protocol.positions[positionIndex];
        if (!finitePositive(position.totalUsdValue)) continue;
        const tokens = [...new Set(position.tokens.map((token) => token.symbol))];
        candidates.push({
          id: `defi:${wallet.walletId}:${protocolIndex}:${positionIndex}:${protocol.platformId}`,
          label: `${protocol.platformName} · ${tokens.join('/') || protocol.network}`,
          valueUsd: position.totalUsdValue,
          baseCategory: '加密资产',
          description: [
            `链=${protocol.network}`,
            `协议=${protocol.platformName}`,
            `仓位类型=${position.type}`,
            `底层代币=${tokens.join(',') || 'unknown'}`,
          ].join('；'),
        });
      }
    }
  }

  if (deribit && finitePositive(deribit.totalUsdValue)) {
    const currencies = [...new Set(deribit.accountSummaries.map((item) => item.currency))];
    const instruments = [...new Set(deribit.positions.map((item) => item.instrument_name))];
    candidates.push({
      id: 'deribit:account-equity',
      label: 'Deribit 账户净值',
      valueUsd: deribit.totalUsdValue,
      baseCategory: '加密资产',
      description: [
        '平台=Deribit',
        '形态=期权与合约统一保证金账户净值',
        `保证金币种=${currencies.join(',') || 'unknown'}`,
        `持仓合约=${instruments.slice(0, 20).join(',') || '无'}`,
      ].join('；'),
    });
  }

  for (const cash of bankCash) {
    if (!finitePositive(cash.valueUsd)) continue;
    candidates.push({
      id: `bank:${cash.id}`,
      label: `${cash.bank} · ${cash.currency} 现金`,
      valueUsd: cash.valueUsd,
      baseCategory: '类现金',
      description: [
        `位置=${cash.bank}`,
        `币种=${cash.currency}`,
        '形态=银行现金余额',
      ].join('；'),
    });
  }

  for (const asset of customAssets) {
    if (!finitePositive(asset.value)) continue;
    candidates.push({
      id: `custom:${asset.id}`,
      label: asset.name,
      valueUsd: asset.value,
      baseCategory: '其它',
      description: `用户自定义资产，名称=${asset.name}`,
    });
  }

  const baseline = [...baselineMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((item) => finitePositive(item.value))
    .sort(
      (a, b) =>
        (CATEGORY_ORDER.get(a.label) ?? 99) -
        (CATEGORY_ORDER.get(b.label) ?? 99)
    );

  return { totalValue, baseline, candidates };
}

function isEconomicCategory(value: unknown): value is EconomicCategory {
  return ECONOMIC_CATEGORIES.includes(value as EconomicCategory);
}

export function normalizeEconomicAnalysis(
  value: unknown,
  input: EconomicAllocationInput
): EconomicAllocationAnalysis {
  const raw = value as {
    summary?: unknown;
    classifications?: unknown;
  };
  const candidateIds = new Set(input.candidates.map((candidate) => candidate.id));
  const seen = new Set<string>();
  const classifications: EconomicClassification[] = [];

  if (Array.isArray(raw?.classifications)) {
    for (const item of raw.classifications) {
      const row = item as { id?: unknown; category?: unknown; reason?: unknown };
      if (
        typeof row.id !== 'string' ||
        !candidateIds.has(row.id) ||
        seen.has(row.id) ||
        !isEconomicCategory(row.category)
      ) {
        continue;
      }
      seen.add(row.id);
      classifications.push({
        id: row.id,
        category: row.category,
        reason:
          typeof row.reason === 'string' && row.reason.trim()
            ? row.reason.trim().slice(0, 80)
            : '按经济属性归类',
      });
    }
  }

  return {
    summary:
      typeof raw?.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim().slice(0, 800)
        : '已按资产的实际风险与流动性重新归类。',
    classifications,
  };
}

export function applyEconomicAnalysis(
  input: EconomicAllocationInput,
  analysis: EconomicAllocationAnalysis
): EconomicAllocationBucket[] {
  const totals = new Map<EconomicCategory, number>(
    ECONOMIC_CATEGORIES.map((category) => [category, 0])
  );
  for (const item of input.baseline) {
    totals.set(item.label, (totals.get(item.label) ?? 0) + item.value);
  }

  const remainingByBase = new Map(totals);
  const detailsByCategory = new Map<
    EconomicCategory,
    Map<string, number>
  >(
    ECONOMIC_CATEGORIES.map((category) => [category, new Map<string, number>()])
  );
  const addDetail = (
    category: EconomicCategory,
    label: string,
    value: number
  ) => {
    if (value <= 0) return;
    const details = detailsByCategory.get(category);
    if (!details) return;
    details.set(label, (details.get(label) ?? 0) + value);
  };

  const classificationById = new Map(
    analysis.classifications.map((item) => [item.id, item.category])
  );
  for (const candidate of input.candidates) {
    const category =
      classificationById.get(candidate.id) ?? candidate.baseCategory;
    const available = Math.max(
      0,
      remainingByBase.get(candidate.baseCategory) ?? 0
    );
    const recognizedValue = Math.min(candidate.valueUsd, available);
    if (recognizedValue <= 0) continue;

    remainingByBase.set(candidate.baseCategory, available - recognizedValue);
    addDetail(category, candidate.label, recognizedValue);

    if (category !== candidate.baseCategory) {
      totals.set(
        candidate.baseCategory,
        Math.max(0, (totals.get(candidate.baseCategory) ?? 0) - recognizedValue)
      );
      totals.set(category, (totals.get(category) ?? 0) + recognizedValue);
    }
  }

  const residualLabels: Record<EconomicCategory, string> = {
    类现金: '现金与稳定币',
    股票: '其它股票',
    加密资产: '其它加密资产',
    衍生品: '其它衍生品',
    其它: '其它资产',
  };
  for (const category of ECONOMIC_CATEGORIES) {
    addDetail(
      category,
      residualLabels[category],
      Math.max(0, remainingByBase.get(category) ?? 0)
    );
  }

  return ECONOMIC_CATEGORIES.map((label) => ({
    label,
    value: Math.max(0, totals.get(label) ?? 0),
    details: [...(detailsByCategory.get(label)?.entries() ?? [])]
      .map(([detailLabel, value]) => ({ label: detailLabel, value }))
      .filter((item) => item.value > 0.005)
      .sort((a, b) => b.value - a.value),
  })).filter((item) => item.value > 0.005);
}

export async function analyzeEconomicAllocation({
  apiKey,
  input,
  signal,
}: {
  apiKey: string;
  input: EconomicAllocationInput;
  signal?: AbortSignal;
}): Promise<EconomicAllocationAnalysis> {
  const system = [
    '你是个人资产看板的经济属性分类器，必须只输出 JSON。',
    `允许的分类只有：${ECONOMIC_CATEGORIES.join('、')}。`,
    '分类依据是资产的实际风险、流动性和收益来源，不是交易场所。',
    '规则：',
    '1. 银行现金、券商现金、稳定币活期，以及可随时赎回且底层全部是稳定币的借贷/储蓄仓位，归为“类现金”。',
    '2. SGOV、BIL、SHV、USFR 等超短期国债或现金管理 ETF 归为“类现金”；长久期债券 ETF 不要归为类现金。',
    '3. BTC、ETH 等波动币种的现货余额归为“加密资产”；含波动资产、LP 无常损失、杠杆、锁仓或明显智能合约策略风险的 DeFi 仓位也归为“加密资产”。',
    '4. 期权、期货、永续合约及其专用保证金账户归为“衍生品”。即使保证金币种是 USDT/USDC，也不能把合约或策略账户保证金归为类现金。普通公司股票与股票 ETF 归为“股票”。',
    '5. 同一币种位于不同平台、账户或网络时，必须分别判断，不得混淆。不得修改金额；classifications 只返回需要改变 baseCategory 的候选，保持原分类的候选不要返回。reason 使用不超过 25 个汉字。',
    '6. summary 用 2 至 4 句中文，重点解释最重要的重分类和组合结构，不提供买卖建议。',
    'JSON 格式示例：{"summary":"...","classifications":[{"id":"stock:ibkr:1","category":"类现金","reason":"超短期国债ETF"}]}。没有重分类时 classifications 返回空数组。',
  ].join('\n');

  const payload = {
    totalValueUsd: input.totalValue,
    baseline: input.baseline,
    candidates: input.candidates,
  };

  const raw = await completeDeepseekJson<unknown>({
    apiKey,
    signal,
    maxTokens: 2400,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `请按上述规则分类并输出 JSON：\n${JSON.stringify(payload)}`,
      },
    ],
  });

  return normalizeEconomicAnalysis(raw, input);
}
