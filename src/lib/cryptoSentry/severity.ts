import type { AlertSeverity } from '@/types/cryptoSentry';

export const ALERT_SEVERITY: Record<AlertSeverity, { label: string; className: string; dotClassName: string }> = {
  info: {
    label: '提示',
    className: 'border-primary/30 bg-primary/10 text-primary classic:border-blue-200 classic:bg-blue-50 classic:text-blue-700 classic:dark:border-blue-800 classic:dark:bg-blue-950/40 classic:dark:text-blue-300',
    dotClassName: 'bg-primary classic:bg-blue-500',
  },
  warning: {
    label: '警告',
    className: 'border-warning/30 bg-warning/10 text-warning classic:border-amber-200 classic:bg-amber-50 classic:text-amber-700 classic:dark:border-amber-800 classic:dark:bg-amber-950/40 classic:dark:text-amber-300',
    dotClassName: 'bg-warning classic:bg-amber-500',
  },
  critical: {
    label: '严重',
    className: 'border-critical/30 bg-critical/10 text-critical classic:border-orange-200 classic:bg-orange-50 classic:text-orange-700 classic:dark:border-orange-800 classic:dark:bg-orange-950/40 classic:dark:text-orange-300',
    dotClassName: 'bg-critical classic:bg-orange-500',
  },
  emergency: {
    label: '紧急',
    className: 'border-negative/30 bg-negative/10 text-negative classic:border-red-200 classic:bg-red-50 classic:text-red-700 classic:dark:border-red-800 classic:dark:bg-red-950/40 classic:dark:text-red-300',
    dotClassName: 'bg-negative classic:bg-red-500',
  },
};
