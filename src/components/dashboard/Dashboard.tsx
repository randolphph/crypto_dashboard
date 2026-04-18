'use client';

import { useState } from 'react';
import { PortfolioSummary } from './PortfolioSummary';
import { ExchangeSection } from './ExchangeSection';
import { DeribitSection } from './DeribitSection';
import { OnchainSection } from './OnchainSection';
import { useExchangeData } from '@/hooks/useExchangeData';
import { useOnchainData } from '@/hooks/useOnchainData';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'exchanges', label: '交易所' },
  { id: 'deribit', label: '期权 (Deribit)' },
  { id: 'onchain', label: '链上钱包' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('exchanges');

  const binance = useExchangeData('binance');
  const okx = useExchangeData('okx');
  const deribit = useExchangeData('deribit');
  const onchain = useOnchainData();

  const isLoading =
    binance.isLoading || okx.isLoading || deribit.isLoading || onchain.isLoading;

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
  ].filter((item): item is { label: string; value: number } => !!item);

  const totalValue = breakdown.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-6">
      <PortfolioSummary
        totalValue={totalValue}
        breakdown={breakdown}
        isLoading={isLoading}
      />

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
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
    </div>
  );
}
