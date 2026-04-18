'use client';

import { formatUsd, formatCrypto } from '@/lib/format';
import type { AssetBalance } from '@/types/common';

interface AssetTableProps {
  balances: AssetBalance[];
}

export function AssetTable({ balances }: AssetTableProps) {
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
            <tr key={item.asset} className="border-b last:border-0">
              <td className="py-2 font-medium">{item.asset}</td>
              <td className="py-2 text-right tabular-nums">
                {formatCrypto(item.amount)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatUsd(item.usdValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
