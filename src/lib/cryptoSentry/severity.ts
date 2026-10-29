import type { AlertSeverity } from '@/types/cryptoSentry';

export const ALERT_SEVERITY: Record<AlertSeverity, { label: string; className: string; dotClassName: string }> = {
  info: {
    label: '提示',
    className: 'border-primary/30 bg-primary/10 text-primary',
    dotClassName: 'bg-primary',
  },
  warning: {
    label: '警告',
    className: 'border-warning/30 bg-warning/10 text-warning',
    dotClassName: 'bg-warning',
  },
  critical: {
    label: '严重',
    className: 'border-critical/30 bg-critical/10 text-critical',
    dotClassName: 'bg-critical',
  },
  emergency: {
    label: '紧急',
    className: 'border-negative/30 bg-negative/10 text-negative',
    dotClassName: 'bg-negative',
  },
};
