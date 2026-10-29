'use client';

import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import { TokenIcon } from './TokenIcon';
import type { AssetBalance } from '@/types/common';
import type { AssetLocation } from '@/lib/portfolio/assetStockMapping';
import { AssetCategorySelect } from './AssetCategorySelect';
import { balanceCategoryKey, defaultBalanceCategory } from '@/lib/portfolio/assetCategories';
import { assetIconSource } from '@/lib/portfolio/assetIconSource';

interface AssetTableProps {
  balances: AssetBalance[];
  location?: AssetLocation;
}

export function AssetTable({ balances, location }: AssetTableProps) {
  const { fmtUsd, fmtCrypto } = usePrivacyFormat();
  const sorted = [...balances].sort((a, b) => b.usdValue - a.usdValue);

  if (sorted.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        暂无资产数据
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">资产</th>
            <th className="pb-2 text-right font-medium">数量</th>
            <th className="pb-2 text-right font-medium">价值 (USD)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr
              key={`${item.chainId ?? ''}:${item.tokenAddress ?? item.asset}`}
              className={`border-b last:border-0 ${item.dedupedToDefi ? 'text-muted-foreground' : ''}`}
            >
              <td className="py-2 font-medium">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <TokenIcon {...assetIconSource(item)} symbol={item.asset} />
                  <span>{item.asset}</span>
                  {location && !item.dedupedToDefi && <AssetCategorySelect assetId={balanceCategoryKey(location, item)} label={item.asset} defaultCategoryId={defaultBalanceCategory(item, location.source !== 'binance' || ['现货','理财','资金账户'].includes(location.account))} />}
                  {item.dedupedToDefi && (
                    <span
                      className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      title={item.exclusionReason === 'aave-receipt'
                        ? 'aToken 是 Aave 存款凭证，不计入钱包资产或总资产'
                        : '该代币的价值已计入下方 DeFi 持仓，不重复加总'}
                    >
                      {item.exclusionReason === 'aave-receipt' ? '不计入资产' : '已计入 DeFi'}
                    </span>
                  )}
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">
                {fmtCrypto(item.amount)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {fmtUsd(item.usdValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
