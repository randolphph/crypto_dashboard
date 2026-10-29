import type { AssetBalance } from '@/types/common';
import { bundledTokenIconUrl } from './tokenIcons';
import { stockIconUrl } from './stockIcons';

/** Known icons are static; the proxy revision bypasses old cached failures. */
export function tokenIconUrl(symbol: string, size: 'small' | 'large' = 'small') {
  return bundledTokenIconUrl(symbol) ?? `/api/token-logo/${encodeURIComponent(symbol)}?v=2${size === 'large' ? '&size=large' : ''}`;
}

/** Keep the source's token identity; use the cached lookup only as a fallback. */
export function assetIconSource(balance: Pick<AssetBalance, 'asset' | 'logo' | 'stockSymbol'>, size: 'small' | 'large' = 'small') {
  const lookup = balance.stockSymbol
    ? stockIconUrl('US', balance.stockSymbol)
    : tokenIconUrl(balance.asset, size);
  return { src: balance.logo || lookup, fallbackSrc: balance.logo && balance.logo !== lookup ? lookup : undefined };
}
