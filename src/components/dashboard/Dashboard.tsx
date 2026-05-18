'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PortfolioSummary } from './PortfolioSummary';
import { ExchangeSection } from './ExchangeSection';
import { DeribitSection } from './DeribitSection';
import { OnchainSection } from './OnchainSection';
import { StockSection } from './StockSection';
import { useExchangeData } from '@/hooks/useExchangeData';
import { useOnchainData } from '@/hooks/useOnchainData';
import { useStockData } from '@/hooks/useStockData';
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
import { cn } from '@/lib/utils';

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

  const categoryBreakdown = [
    { label: '加密', value: cryptoValue },
    { label: '股票', value: stocksValue },
    { label: '现金', value: cashValue },
    { label: '其它', value: otherValue },
  ].filter((c) => c.value > 0);

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
      setLastRefreshed(new Date().toLocaleTimeString());
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

  return (
    <div className="space-y-6">
      <PortfolioSummary
        totalValue={totalValue}
        breakdown={breakdown}
        categoryBreakdown={categoryBreakdown}
        isLoading={isLoading}
      />

      {/* Tabs grouped by asset category. Mobile keeps everything on one
          scrollable row; on wider screens a subtle group label is shown above
          each chunk and a vertical separator divides 加密 from 股票. */}
      <div className="border-b">
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
    </div>
  );
}
