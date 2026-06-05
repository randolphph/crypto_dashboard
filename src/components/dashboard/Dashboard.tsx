'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PortfolioSummary } from './PortfolioSummary';
import { ExchangeSection } from './ExchangeSection';
import { DeribitSection } from './DeribitSection';
import { OnchainSection } from './OnchainSection';
import { StockSection } from './StockSection';
import { WalletManager } from '@/components/settings/WalletManager';
import { StockPositionsManager } from '@/components/settings/StockPositionsManager';
import { CashBalancesManager } from '@/components/settings/CashBalancesManager';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useExchangeData } from '@/hooks/useExchangeData';
import { useOnchainData } from '@/hooks/useOnchainData';
import { useStockData } from '@/hooks/useStockData';
import { useSnapshotPush } from '@/hooks/useSnapshotPush';
import { buildSnapshot } from '@/lib/portfolio/snapshot';
import { useVaultStore } from '@/stores/vaultStore';
import { useCustomAssetStore } from '@/stores/customAssetStore';
import { usePortfolioHistoryStore } from '@/stores/portfolioHistoryStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { BROKER_LABEL, type StockBroker } from '@/types/stocks';
import {
  classifyBinance,
  classifyOkx,
  classifyDeribit,
  classifyOnchain,
} from '@/lib/portfolio/category';
import { buildPositionBreakdown } from '@/lib/portfolio/positions';
import { cn } from '@/lib/utils';

type AddDialog = 'wallet' | 'stock-position' | 'stock-cash';
const STOCK_TAB_IDS = ['ths', 'longport', 'ibkr'] as const;
type StockTabId = (typeof STOCK_TAB_IDS)[number];
function isStockTab(id: string): id is StockTabId {
  return (STOCK_TAB_IDS as readonly string[]).includes(id);
}

const tabGroups = [
  {
    id: 'crypto',
    label: '加密',
    tabs: [
      { id: 'exchanges', label: '交易所' },
      { id: 'deribit', label: '期权 (Deribit)' },
      { id: 'onchain', label: '链上钱包' },
    ],
  },
  {
    id: 'stocks',
    label: '股票',
    tabs: [
      { id: 'ths', label: 'A股' },
      { id: 'longport', label: '长桥' },
      { id: 'ibkr', label: 'IBKR' },
    ],
  },
] as const;

type TabId =
  | (typeof tabGroups)[number]['tabs'][number]['id'];

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('exchanges');
  const [addDialog, setAddDialog] = useState<AddDialog | null>(null);
  const queryClient = useQueryClient();

  const binance = useExchangeData('binance');
  const okx = useExchangeData('okx');
  const deribit = useExchangeData('deribit');
  const onchain = useOnchainData();
  const stocks = useStockData();
  const customAssets = useCustomAssetStore((s) => s.assets);
  const addSnapshot = usePortfolioHistoryStore((s) => s.addSnapshot);
  const setLastRefreshed = useDashboardStore((s) => s.setLastRefreshed);

  const isLoading =
    binance.isLoading ||
    okx.isLoading ||
    deribit.isLoading ||
    onchain.isLoading ||
    stocks.isLoading;

  const hasError =
    binance.isError ||
    okx.isError ||
    deribit.isError ||
    onchain.isError ||
    stocks.isError;

  const brokerById = (b: StockBroker) =>
    stocks.data?.brokers.find((x) => x.broker === b);

  const stockBreakdown = (['ths', 'longport', 'ibkr'] as StockBroker[])
    .map((b) => {
      const d = brokerById(b);
      if (!d || d.totalUsdValue === 0) return null;
      return { label: BROKER_LABEL[b], value: d.totalUsdValue };
    })
    .filter((x): x is { label: string; value: number } => !!x);

  const breakdown = [
    binance.data?.configured !== false && { label: 'Binance', value: binance.data?.totalUsdValue ?? 0 },
    okx.data?.configured !== false && { label: 'OKX', value: okx.data?.totalUsdValue ?? 0 },
    deribit.data?.configured !== false && { label: 'Deribit', value: deribit.data?.totalUsdValue ?? 0 },
    {
      label: '链上',
      value:
        onchain.data?.reduce(
          (sum: number, w: { totalUsdValue: number }) => sum + w.totalUsdValue,
          0
        ) ?? 0,
    },
    ...stockBreakdown,
    ...customAssets.map((a) => ({ label: a.name, value: a.value })),
  ].filter((item): item is { label: string; value: number } => !!item);

  // Category-level rollup: the high-level "where are my eggs" view. We can't
  // just sum each exchange's totalUsdValue under "加密" because stablecoins
  // sitting in spot wallets are conceptually cash. classify* functions split
  // each source into (cash, crypto) based on account type — USDT in Spot is
  // cash, USDT used as futures margin is exposure.
  const binCat = classifyBinance(binance.data);
  const okxCat = classifyOkx(okx.data);
  const derCat = classifyDeribit(deribit.data);
  const onCat = classifyOnchain(onchain.data);

  const stockBrokers = stocks.data?.brokers ?? [];
  const stocksValue = stockBrokers.reduce((s, b) => s + b.positionsUsdValue, 0);
  const stockCashValue = stockBrokers.reduce((s, b) => s + b.cashUsdValue, 0);

  const cryptoValue =
    binCat.crypto + okxCat.crypto + derCat.crypto + onCat.crypto;
  const cashValue =
    binCat.cash + okxCat.cash + onCat.cash + stockCashValue;
  const otherValue = customAssets.reduce((s, a) => s + a.value, 0);

  // Detail breakdowns power the click-to-drill-down on the pie chart and
  // category strip. Each detail row should answer "where does this part of
  // 加密/现金/股票/其它 actually come from?" at the source / broker level.
  const cryptoDetails = [
    { label: 'Binance', value: binCat.crypto },
    { label: 'OKX', value: okxCat.crypto },
    { label: 'Deribit', value: derCat.crypto },
    { label: '链上', value: onCat.crypto },
  ].filter((d) => d.value > 0);

  const cashDetails = [
    { label: 'Binance', value: binCat.cash },
    { label: 'OKX', value: okxCat.cash },
    { label: '链上', value: onCat.cash },
    ...stockBrokers
      .filter((b) => b.cashUsdValue > 0)
      .map((b) => ({
        label: `${BROKER_LABEL[b.broker]} 现金`,
        value: b.cashUsdValue,
      })),
  ].filter((d) => d.value > 0);

  const stocksDetails = stockBrokers
    .filter((b) => b.positionsUsdValue > 0)
    .map((b) => ({
      label: BROKER_LABEL[b.broker],
      value: b.positionsUsdValue,
    }));

  const otherDetails = customAssets.map((a) => ({
    label: a.name,
    value: a.value,
  }));

  const categoryBreakdown = [
    { label: '加密', value: cryptoValue, details: cryptoDetails },
    { label: '股票', value: stocksValue, details: stocksDetails },
    { label: '现金', value: cashValue, details: cashDetails },
    { label: '其它', value: otherValue, details: otherDetails },
  ].filter((c) => c.value > 0);

  // Position composition (non-cash). Split by direction so long/short futures
  // and long/short options are visible at a glance — the user wants to see
  // exposure shape, not just asset class.
  const positionBreakdown = buildPositionBreakdown({
    binance: binance.data,
    okx: okx.data,
    deribit: deribit.data,
    onchain: onchain.data,
    stocks: stocks.data,
  });

  const totalValue = breakdown.reduce((sum, item) => sum + item.value, 0);

  // Track custom assets changes: when they change, refresh API data + record snapshot
  const prevCustomAssetsRef = useRef(customAssets);
  useEffect(() => {
    const prev = prevCustomAssetsRef.current;
    prevCustomAssetsRef.current = customAssets;

    // Skip on initial mount
    if (prev === customAssets) return;

    const prevTotal = prev.reduce((s, a) => s + a.value, 0);
    const currTotal = customAssets.reduce((s, a) => s + a.value, 0);
    if (prevTotal !== currTotal) {
      queryClient.invalidateQueries();
      setLastRefreshed(Date.now());
    }
  }, [customAssets, queryClient, setLastRefreshed]);

  // Record snapshot when total value settles (not loading and value > 0)
  const lastRecordedRef = useRef<number>(0);
  const recordSnapshot = useCallback(() => {
    if (!isLoading && !hasError && totalValue > 0 && totalValue !== lastRecordedRef.current) {
      lastRecordedRef.current = totalValue;
      addSnapshot(totalValue);
    }
  }, [isLoading, hasError, totalValue, addSnapshot]);

  useEffect(() => {
    recordSnapshot();
  }, [recordSnapshot]);

  // Push a detailed per-position snapshot to the home-server backend for
  // later AI analysis. Backend partitions all rows by `wallet`, so the same
  // dashboard run from prod vs local dev (different wallets) won't collide.
  // No wallet → no push (e.g., still on the unlock screen).
  const walletAddress = useVaultStore((s) => s.address);
  const snapshotReady =
    !isLoading && !hasError && totalValue > 0 && !!walletAddress;
  const snapshotPayload =
    snapshotReady && walletAddress
      ? buildSnapshot({
          wallet: walletAddress,
          binance: binance.data,
          okx: okx.data,
          deribit: deribit.data,
          onchain: onchain.data,
          stocks: stocks.data,
          portfolio: {
            totalUsd: totalValue,
            cryptoUsd: cryptoValue,
            stocksUsd: stocksValue,
            cashUsd: cashValue,
            otherUsd: otherValue,
            fxCnyUsd: stocks.data?.fx.cnyUsd,
            fxHkdUsd: stocks.data?.fx.hkdUsd,
            fxKrwUsd: stocks.data?.fx.krwUsd,
          },
        })
      : null;
  useSnapshotPush(snapshotPayload, { enabled: snapshotReady });

  return (
    <div className="space-y-6">
      <PortfolioSummary
        totalValue={totalValue}
        breakdown={breakdown}
        categoryBreakdown={categoryBreakdown}
        positionBreakdown={positionBreakdown}
        isLoading={isLoading}
      />

      {/* Tabs grouped by asset category. Mobile keeps everything on one
          scrollable row; on wider screens a subtle group label is shown above
          each chunk and a vertical separator divides 加密 from 股票. */}
      <div className="border-b">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-end gap-3 overflow-x-auto">
            {tabGroups.map((group, gi) => (
              <div key={group.id} className="flex items-end">
                {gi > 0 && (
                  <div className="mb-2 mr-3 hidden h-5 w-px bg-border md:block" />
                )}
                <div className="flex flex-col">
                  <span className="hidden px-4 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 md:block">
                    {group.label}
                  </span>
                  <div className="flex gap-1">
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          'whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                          activeTab === tab.id
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tab-context action: lets the user add the entity that lives in
              this tab without bouncing to Settings. Crypto exchanges + Deribit
              are API-driven so they have no manual-add affordance here. */}
          <div className="mb-1 flex shrink-0 items-center gap-1.5">
            {activeTab === 'onchain' && (
              <AddButton onClick={() => setAddDialog('wallet')} label="添加钱包" />
            )}
            {isStockTab(activeTab) && (
              <>
                <AddButton
                  onClick={() => setAddDialog('stock-position')}
                  label="编辑持仓"
                />
                <AddButton
                  onClick={() => setAddDialog('stock-cash')}
                  label="编辑现金"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'exchanges' && (
        <ExchangeSection binance={binance} okx={okx} />
      )}
      {activeTab === 'deribit' && (
        <DeribitSection data={deribit.data} isLoading={deribit.isLoading} />
      )}
      {activeTab === 'onchain' && (
        <OnchainSection
          wallets={onchain.data ?? []}
          isLoading={onchain.isLoading}
        />
      )}
      {(activeTab === 'ths' ||
        activeTab === 'longport' ||
        activeTab === 'ibkr') && (
        <StockSection
          broker={activeTab}
          data={brokerById(activeTab)}
          isLoading={stocks.isLoading}
          error={stocks.error as Error | null}
        />
      )}

      <Dialog
        open={addDialog !== null}
        onOpenChange={(open) => {
          if (!open) setAddDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {addDialog === 'wallet' && (
            <>
              <DialogHeader>
                <DialogTitle>添加链上钱包</DialogTitle>
              </DialogHeader>
              <WalletManager embedded autoOpenForm />
            </>
          )}
          {addDialog === 'stock-position' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  添加股票持仓 · {isStockTab(activeTab) ? BROKER_LABEL[activeTab] : ''}
                </DialogTitle>
              </DialogHeader>
              <StockPositionsManager
                embedded
                autoOpenForm
                initialBroker={isStockTab(activeTab) ? activeTab : 'ths'}
              />
            </>
          )}
          {addDialog === 'stock-cash' && (
            <>
              <DialogHeader>
                <DialogTitle>
                  添加券商现金 · {isStockTab(activeTab) ? BROKER_LABEL[activeTab] : ''}
                </DialogTitle>
              </DialogHeader>
              <CashBalancesManager
                embedded
                autoOpenForm
                initialBroker={isStockTab(activeTab) ? activeTab : 'ths'}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
