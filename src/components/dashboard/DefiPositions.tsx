'use client';

import Image from 'next/image';
import { usePrivacyFormat } from '@/hooks/usePrivacyFormat';
import type {
  DefiInvestType,
  DefiProtocolPosition,
} from '@/types/onchain';

const INVEST_TYPE_LABEL: Record<DefiInvestType, string> = {
  save: '存款',
  pool: '流动性',
  farm: '农场',
  vaults: '金库',
  stake: '质押',
  other: '其他',
};

interface DefiPositionsProps {
  positions: DefiProtocolPosition[];
  totalUsdValue: number;
}

export function DefiPositions({ positions, totalUsdValue }: DefiPositionsProps) {
  const { fmtUsd, fmtCrypto } = usePrivacyFormat();

  if (positions.length === 0) return null;

  return (
    <div className="mt-5 border-t pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-muted-foreground">
          DeFi 持仓
        </h4>
        <span className="text-sm font-medium text-muted-foreground">
          {fmtUsd(totalUsdValue)}
        </span>
      </div>

      <div className="space-y-3">
        {positions.map((p) => (
          <div
            key={`${p.platformId}-${p.chainId}`}
            className="rounded-lg bg-muted/40 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {p.platformLogo && (
                  <Image
                    src={p.platformLogo}
                    alt=""
                    width={20}
                    height={20}
                    className="rounded-full"
                    unoptimized
                  />
                )}
                <span className="truncate text-sm font-medium">
                  {p.platformName}
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                  {p.network}
                </span>
              </div>
              <span className="text-sm tabular-nums">
                {fmtUsd(p.totalUsdValue)}
              </span>
            </div>

            <div className="space-y-1.5">
              {p.positions.map((pos, i) => (
                <div key={i} className="text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{INVEST_TYPE_LABEL[pos.type]}</span>
                    <span className="tabular-nums">
                      {fmtUsd(pos.totalUsdValue)}
                    </span>
                  </div>
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {pos.tokens.map((t, j) => (
                      <div
                        key={j}
                        className="flex items-center justify-between"
                      >
                        <span className="flex items-center gap-1.5">
                          {t.logo && (
                            <Image
                              src={t.logo}
                              alt=""
                              width={12}
                              height={12}
                              className="rounded-full"
                              unoptimized
                            />
                          )}
                          <span>{t.symbol}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {fmtCrypto(t.amount)}
                          </span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {fmtUsd(t.usdValue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
