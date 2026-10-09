import { isNonNegativeDecimal, isPositiveDecimal } from './decimal';

export const COPY_SETTINGS_KEY = 'crypto-dashboard.hyperliquid-copy-settings.v1';
export const DEFAULT_COPY_SETTINGS = { ratio: '0.1', maxSlippagePercent: '0.5' };

export function validCopySlippage(value: string) {
  return isNonNegativeDecimal(value) && Number(value) <= 5;
}

export function parseCopySettings(raw: string | null) {
  try {
    const value = JSON.parse(raw ?? '{}');
    return {
      ratio: typeof value?.ratio === 'string' && isPositiveDecimal(value.ratio) ? value.ratio : DEFAULT_COPY_SETTINGS.ratio,
      maxSlippagePercent: typeof value?.maxSlippagePercent === 'string' && validCopySlippage(value.maxSlippagePercent)
        ? value.maxSlippagePercent : DEFAULT_COPY_SETTINGS.maxSlippagePercent,
    };
  } catch {
    return DEFAULT_COPY_SETTINGS;
  }
}
