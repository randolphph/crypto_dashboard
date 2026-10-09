'use client';

import { useState, useSyncExternalStore } from 'react';
import { isPositiveDecimal } from '@/lib/hyperliquid/decimal';
import { COPY_SETTINGS_KEY, parseCopySettings, validCopySlippage } from '@/lib/hyperliquid/settings';

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === COPY_SETTINGS_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
function getSnapshot() {
  try { return window.localStorage.getItem(COPY_SETTINGS_KEY); } catch { return null; }
}

export function useCopyTradingSettings() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const saved = parseCopySettings(raw);
  const [ratioDraft, setRatioDraft] = useState<string | null>(null);
  const [slippageDraft, setSlippageDraft] = useState<string | null>(null);
  function save(key: 'ratio' | 'maxSlippagePercent', value: string) {
    try {
      window.localStorage.setItem(COPY_SETTINGS_KEY, JSON.stringify({ ...parseCopySettings(getSnapshot()), [key]: value }));
      listeners.forEach((listener) => listener());
    } catch { /* Storage can be disabled; keep the current input usable. */ }
  }
  return {
    ratio: ratioDraft ?? saved.ratio,
    maxSlippagePercent: slippageDraft ?? saved.maxSlippagePercent,
    setRatio(value: string) {
      setRatioDraft(value);
      if (isPositiveDecimal(value)) save('ratio', value);
    },
    setMaxSlippagePercent(value: string) {
      setSlippageDraft(value);
      if (validCopySlippage(value)) save('maxSlippagePercent', value);
    },
  };
}
