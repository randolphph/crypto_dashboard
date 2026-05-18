'use client';

import { useFx } from '@/hooks/useFx';
import { useStockData } from '@/hooks/useStockData';

export function FxBadge() {
  const fxQuery = useFx();
  const stockQuery = useStockData();

  // Prefer the FX that /api/stocks actually used for portfolio math; fall back
  // to the standalone /api/fx hook when no stock positions/cash are present.
  const stocksFx = stockQuery.data?.fx;
  const preferStocks =
    stocksFx && stocksFx.cnyUsd > 0 && stocksFx.hkdUsd > 0;
  const source = preferStocks ? stocksFx : fxQuery.data;

  if (!source || !source.cnyUsd || !source.hkdUsd) return null;

  const usdCny = 1 / source.cnyUsd;
  const usdHkd = 1 / source.hkdUsd;

  return (
    <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
      <span className="flex items-center gap-1.5">
        <FlagIcon code="cn" alt="CNY" />
        CNY <span className="text-foreground font-medium">{usdCny.toFixed(2)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <FlagIcon code="hk" alt="HKD" />
        HKD <span className="text-foreground font-medium">{usdHkd.toFixed(2)}</span>
      </span>
    </div>
  );
}

function FlagIcon({ code, alt }: { code: string; alt: string }) {
  // flagcdn.com serves free country-flag SVGs; ISO-3166-1 alpha-2 in lowercase.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`https://flagcdn.com/${code}.svg`}
      alt={alt}
      width={16}
      height={12}
      loading="lazy"
      className="shrink-0"
    />
  );
}
