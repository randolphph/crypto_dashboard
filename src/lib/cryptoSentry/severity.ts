import type { AlertSeverity } from '@/types/cryptoSentry';

export const ALERT_SEVERITY: Record<AlertSeverity, { label: string; className: string; dotClassName: string }> = {
  info: {
    label: '提示',
    className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
    dotClassName: 'bg-blue-500',
  },
  warning: {
    label: '警告',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    dotClassName: 'bg-amber-500',
  },
  critical: {
    label: '严重',
    className: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
    dotClassName: 'bg-orange-500',
  },
  emergency: {
    label: '紧急',
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
    dotClassName: 'bg-red-500',
  },
};
