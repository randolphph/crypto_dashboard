'use client';

import { useState } from 'react';
import type { StockMarket } from '@/types/stocks';

export function StockLogo({
  market,
  symbol,
}: {
  market: StockMarket;
  symbol: string;
}) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    const letter = (symbol.replace(/[^A-Za-z0-9]/g, '')[0] ?? '?').toUpperCase();
    return (
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground ring-1 ring-border/60">
        {letter}
      </span>
    );
  }

  // The same-origin route provides browser/CDN/server caching and falls back
  // across market suffixes before this component shows the letter avatar.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`/api/stock-logo/${market}/${encodeURIComponent(symbol)}`}
      alt=""
      width={20}
      height={20}
      loading="lazy"
      className="h-5 w-5 shrink-0 rounded-full bg-white/90 object-contain p-0.5 ring-1 ring-border/60"
      onError={() => setErrored(true)}
    />
  );
}
