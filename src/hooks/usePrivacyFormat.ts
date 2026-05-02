'use client';

import { formatUsd, formatCrypto } from '@/lib/format';
import { usePrivacyStore } from '@/stores/privacyStore';

export const PRIVACY_MASK = '******';
export const PRIVACY_MASK_SHORT = '****';

export function usePrivacyFormat() {
  const hidden = usePrivacyStore((s) => s.hidden);

  return {
    hidden,
    fmtUsd: (value: number) => (hidden ? PRIVACY_MASK : formatUsd(value)),
    fmtCrypto: (value: number, decimals?: number) =>
      hidden ? PRIVACY_MASK_SHORT : formatCrypto(value, decimals),
    mask: (text: string) => (hidden ? PRIVACY_MASK : text),
  };
}
