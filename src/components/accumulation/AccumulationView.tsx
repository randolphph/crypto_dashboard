'use client';

import { useState, useMemo, useEffect } from 'react';
import { Target, Power, FileJson, X, Plus } from 'lucide-react';
import { useAccumulationStore } from '@/stores/accumulationStore';
import { useGate } from '@/hooks/useGate';
import { useExchangeData } from '@/hooks/useExchangeData';
import { useOnchainData } from '@/hooks/useOnchainData';
import { useStockData } from '@/hooks/useStockData';
import { useFx } from '@/hooks/useFx';
import { useWatchQuotes, type WatchSymbol } from '@/hooks/useWatchQuotes';
import { useBankAccountStore } from '@/stores/bankAccountStore';
import { useCustomAssetStore } from '@/stores/customAssetStore';
import {
  deriveTargets,
  rollupSectors,
  deriveFunding,
  orphanHoldings,
  displayName,
  type OrphanHolding,
} from '@/lib/accumulation/derive';
import {
  DEFAULT_BUDGET_RATIOS,
  type AccumulationTarget,
} from '@/types/accumulation';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { SectorDonut } from './SectorDonut';
import { FundingOverview } from './FundingOverview';
import { TargetTable } from './TargetTable';
import { cn } from '@/lib/utils';

// Available "ammo" = money that can actually buy stocks: broker cash + bank
// cash. Deliberately excludes crypto stablecoins.
function bankUsd(
  currency: string,
  amount: number,
  fx: { cnyUsd: number; hkdUsd: number; krwUsd: number } | undefined
): number {
  if (currency === 'USD') return amount;
  if (!fx) return 0;
  if (currency === 'CNY') return amount * fx.cnyUsd;
  if (currency === 'HKD') return amount * fx.hkdUsd;
  if (currency === 'KRW') return amount * fx.krwUsd;
  return 0;
}

export function AccumulationView() {
  const targets = useAccumulationStore((s) => s.targets);
  const replaceAll = useAccumulationStore((s) => s.replaceAll);
  const addTarget = useAccumulationStore((s) => s.addTarget);
  const { gate, setOpen, isMutating } = useGate();

  // Live data — these hooks share react-query / zustand state with the
  // dashboard, so mounting them here is a cache hit, not extra network cost.
  const binance = useExchangeData('binance');
  const okx = useExchangeData('okx');
  const deribit = useExchangeData('deribit');
  const onchain = useOnchainData();
  const stocks = useStockData();
  const fxQuery = useFx();
  const bankAccounts = useBankAccountStore((s) => s.accounts);
  const customAssets = useCustomAssetStore((s) => s.assets);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const fx = stocks.data?.fx ?? fxQuery.data;

  const { totalPortfolioUsd, availableAmmo } = useMemo(() => {
    const brokers = stocks.data?.brokers ?? [];
    const stocksTotal = brokers.reduce((s, b) => s + b.totalUsdValue, 0);
    const brokerCash = brokers.reduce((s, b) => s + b.cashUsdValue, 0);
    const bankTotal = bankAccounts.reduce(
      (s, a) => s + bankUsd(a.currency, a.amount, fx),
      0
    );
    const onchainTotal =
      onchain.data?.reduce(
        (s: number, w: { totalUsdValue: number }) => s + w.totalUsdValue,
        0
      ) ?? 0;
    const customTotal = customAssets.reduce((s, a) => s + a.value, 0);
    const total =
      (binance.data?.totalUsdValue ?? 0) +
      (okx.data?.totalUsdValue ?? 0) +
      (deribit.data?.totalUsdValue ?? 0) +
      onchainTotal +
      stocksTotal +
      bankTotal +
      customTotal;
    return { totalPortfolioUsd: total, availableAmmo: brokerCash + bankTotal };
  }, [
    binance.data,
    okx.data,
    deribit.data,
    onchain.data,
    stocks.data,
    bankAccounts,
    customAssets,
    fx,
  ]);

  // Held names already come from the shared useStockData() feed. Only the
  // not-yet-held plan names need a supplemental quote, so we fetch just those.
  const heldKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of stocks.data?.brokers ?? [])
      for (const p of b.positions)
        s.add(`${p.market}:${p.symbol.trim().toUpperCase()}`);
    return s;
  }, [stocks.data]);

  const watchSymbols = useMemo<WatchSymbol[]>(() => {
    const seen = new Set<string>();
    const out: WatchSymbol[] = [];
    for (const t of targets) {
      const k = `${t.market}:${t.symbol.trim().toUpperCase()}`;
      if (heldKeys.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push({ market: t.market, symbol: t.symbol });
    }
    return out;
  }, [targets, heldKeys]);

  const watchQuotes = useWatchQuotes(watchSymbols);

  const derived = useMemo(
    () => deriveTargets(targets, stocks.data, gate, watchQuotes.data ?? []),
    [targets, stocks.data, gate, watchQuotes.data]
  );
  const orphans = useMemo(
    () => orphanHoldings(targets, stocks.data),
    [targets, stocks.data]
  );
  const rollups = useMemo(() => rollupSectors(derived), [derived]);
  const funding = useMemo(
    () => deriveFunding(derived, totalPortfolioUsd, availableAmmo),
    [derived, totalPortfolioUsd, availableAmmo]
  );

  const [showImport, setShowImport] = useState(false);
  // Sector highlight lights up both rings, the legend dot, and the matching
  // table rows. Hover previews; click pins. Effective = hover falls back to
  // pin, so hovering elsewhere previews without losing the lock.
  const [pinnedSector, setPinnedSector] = useState<string | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const activeSector = hoveredSector ?? pinnedSector;
  const togglePin = (sector: string) =>
    setPinnedSector((prev) => (prev === sector ? null : sector));

  // 从持仓一键建标的:带出 symbol/market/现值,ma20 预填当前价,目标先等于现值
  // (诚实起点),其余走默认档位,用户再去 JSON 里微调。
  const addFromHolding = (o: OrphanHolding) => {
    addTarget({
      symbol: o.symbol,
      market: o.market,
      sector: '未分类',
      ma20: o.priceLocal ?? 0,
      tierOffsets: [-0.03, -0.06, -0.1],
      budgetRatios: DEFAULT_BUDGET_RATIOS,
      targetValue: Math.round(o.currentValue),
      currentValueSnapshot: o.currentValue,
      status: 'active',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="h-6 w-6 text-blue-500" />
          <h1 className="text-xl font-bold">AI 加仓计划</h1>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            只读
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <FileJson className="h-4 w-4" />
            计划 JSON
          </button>
          {/* 闸门开关：全局触发提示的总闸。Redis 共享、多设备联动。 */}
          <button
            onClick={() => setOpen(!gate.open)}
            disabled={isMutating}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
              gate.open
                ? 'bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/40'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <Power className="h-4 w-4" />
            闸门 {gate.open ? '开' : '关'}
          </button>
        </div>
      </div>

      <FundingOverview funding={funding} />

      {/* 环形图居中放大,表格放到下方全宽。 */}
      <div className="flex justify-center -mt-4">
        <SectorDonut
          rollups={rollups}
          activeSector={activeSector}
          onHover={setHoveredSector}
          onTogglePin={togglePin}
        />
      </div>

      {/* 差异标记:持仓里有、计划里没有的标的。点一下即可一键纳入计划。 */}
      {orphans.length > 0 && <OrphanStrip orphans={orphans} onAdd={addFromHolding} />}

      <TargetTable derived={derived} activeSector={activeSector} />

      {hydrated && targets.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          还没有加仓标的。点击右上角「计划 JSON」粘贴计划。
        </div>
      )}

      {showImport && (
        <ImportDialog
          current={targets}
          onClose={() => setShowImport(false)}
          onApply={(next) => {
            replaceAll(next);
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}

function OrphanStrip({
  orphans,
  onAdd,
}: {
  orphans: OrphanHolding[];
  onAdd: (o: OrphanHolding) => void;
}) {
  const { fmtUsd, hidden } = usePrivacyFormat();
  return (
    <div className="rounded-lg border border-dashed p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Plus className="h-3.5 w-3.5" />
        持仓未纳入计划 ({orphans.length}) —— 点击一键建标的
      </div>
      <div className="flex flex-wrap gap-1.5">
        {orphans.map((o) => (
          <button
            key={`${o.market}:${o.symbol}`}
            onClick={() => onAdd(o)}
            className="inline-flex items-center gap-1.5 rounded-md border bg-secondary/40 px-2 py-1 text-xs hover:bg-secondary transition-colors"
          >
            <span className="font-medium">
              {displayName(o.market, o.symbol, o.name)}
            </span>
            <span className="text-muted-foreground">
              {hidden ? '****' : fmtUsd(o.currentValue)}
            </span>
            <Plus className="h-3 w-3 text-blue-500" />
          </button>
        ))}
      </div>
    </div>
  );
}

const SAMPLE: AccumulationTarget[] = [
  {
    id: '',
    symbol: 'NVDA',
    market: 'US',
    sector: 'AI 算力',
    ma20: 170,
    tierOffsets: [-0.03, -0.06, -0.1],
    budgetRatios: [0.3, 0.3, 0.4],
    targetValue: 40000,
    status: 'active',
  },
  {
    id: '',
    symbol: '600519',
    market: 'A',
    sector: '消费',
    ma20: 1500,
    tierOffsets: [-0.04, -0.08, -0.12],
    targetValue: 20000,
    status: 'active',
  },
];

function ImportDialog({
  current,
  onClose,
  onApply,
}: {
  current: AccumulationTarget[];
  onClose: () => void;
  onApply: (targets: AccumulationTarget[]) => void;
}) {
  const [text, setText] = useState(() =>
    JSON.stringify(current.length ? current : SAMPLE, null, 2)
  );
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('JSON 解析失败,请检查格式');
      return;
    }
    if (!Array.isArray(parsed)) {
      setError('顶层必须是数组');
      return;
    }
    const out: AccumulationTarget[] = [];
    for (const raw of parsed) {
      const t = raw as Partial<AccumulationTarget>;
      if (
        typeof t.symbol !== 'string' ||
        typeof t.market !== 'string' ||
        typeof t.ma20 !== 'number' ||
        !Array.isArray(t.tierOffsets) ||
        t.tierOffsets.length !== 3 ||
        typeof t.targetValue !== 'number'
      ) {
        setError(`标的字段不完整: ${JSON.stringify(raw).slice(0, 60)}…`);
        return;
      }
      out.push({
        id: typeof t.id === 'string' ? t.id : '',
        symbol: t.symbol,
        market: t.market as AccumulationTarget['market'],
        sector: typeof t.sector === 'string' ? t.sector : '未分类',
        ma20: t.ma20,
        tierOffsets: t.tierOffsets as [number, number, number],
        budgetRatios: t.budgetRatios,
        targetValue: t.targetValue,
        currentValueSnapshot: t.currentValueSnapshot,
        status: (t.status as AccumulationTarget['status']) ?? 'active',
        note: t.note,
      });
    }
    onApply(out);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">加仓计划 JSON</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          A 股手动维护:每个标的 symbol / market(A·HK·US·KR) / sector / ma20 /
          tierOffsets[3] / targetValue / status。锚价与各档预算自动算出。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="h-72 w-full resize-none rounded-md border bg-muted/30 p-3 font-mono text-xs"
        />
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
          >
            取消
          </button>
          <button
            onClick={apply}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            应用（覆盖全部）
          </button>
        </div>
      </div>
    </div>
  );
}
