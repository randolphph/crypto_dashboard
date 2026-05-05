'use client';

import { useState } from 'react';

interface TokenIconProps {
  src?: string;
  symbol: string;
  size?: number;
}

export function TokenIcon({ src, symbol, size = 20 }: TokenIconProps) {
  const [errored, setErrored] = useState(false);
  const px = `${size}px`;

  if (!src || errored) {
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

  // Token icons come from a third-party CDN (Trust Wallet's GitHub repo) — no
  // point routing through next/image's optimizer, and broken URLs need a
  // graceful fallback that <Image> doesn't make easy.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full"
      onError={() => setErrored(true)}
    />
  );
}
