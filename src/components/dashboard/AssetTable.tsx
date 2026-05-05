'use client';

import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import type { AssetBalance } from '@/types/common';

interface AssetTableProps {
  balances: AssetBalance[];
}

export function AssetTable({ balances }: AssetTableProps) {
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
              key={item.asset}
              className={`border-b last:border-0 ${item.dedupedToDefi ? 'text-muted-foreground' : ''}`}
            >
              <td className="py-2 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {item.asset}
                  {item.dedupedToDefi && (
                    <span
                      className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      title="该代币的价值已计入下方 DeFi 持仓，不重复加总"
                    >
                      已计入 DeFi
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
