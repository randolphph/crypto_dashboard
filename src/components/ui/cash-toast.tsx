'use client';

import { useEffect } from 'react';
import { useCashToastStore, type CashToast } from '@/stores/cashToastStore';
import { BROKER_LABEL } from '@/types/stocks';
import { cn } from '@/lib/utils';

const DISMISS_AFTER_MS = 3000;

function ToastItem({ toast }: { toast: CashToast }) {
  const dismiss = useCashToastStore((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [toast.id, dismiss]);

  const positive = toast.delta >= 0;
  const formatted = Math.abs(toast.delta).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });

  return (
    <div
      className={cn(
        'pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-300',
        'rounded-lg border bg-popover px-3 py-2 shadow-md backdrop-blur',
        positive ? 'border-green-500/40' : 'border-red-500/40'
      )}
    >
      <p className="text-xs text-muted-foreground">
        {BROKER_LABEL[toast.broker]} · {toast.reason ?? '现金变动'}
      </p>
      <p
        className={cn(
          'font-semibold tabular-nums',
          positive ? 'text-green-600' : 'text-red-600'
        )}
      >
        {positive ? '+' : '-'}
        {formatted} {toast.currency}
      </p>
    </div>
  );
}

export function CashToastContainer() {
  const toasts = useCashToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
