'use client';

import { useState } from 'react';

interface TokenIconProps {
  src?: string;
  fallbackSrc?: string;
  symbol: string;
  size?: number;
}

export function TokenIcon({ src, fallbackSrc, symbol, size = 20 }: TokenIconProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const activeSrc = [src, fallbackSrc].find(value => value && !failedSources.includes(value));
  const px = `${size}px`;

  if (!activeSrc) {
    const letter = (symbol.replace(/[^A-Za-z0-9]/g, '')[0] ?? '?').toUpperCase();
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground"
        style={{ width: px, height: px }}
      >
        {letter}
      </span>
    );
  }

  // Source CDN and same-origin cached images share the same small layout.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activeSrc}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`shrink-0 rounded-full${activeSrc.startsWith('/stock-icons/') || activeSrc.startsWith('/api/stock-logo/') ? ' bg-white' : ''}`}
      onError={() => setFailedSources(current => current.includes(activeSrc) ? current : [...current, activeSrc])}
    />
  );
}
