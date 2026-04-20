'use client';

import { useDashboardStore } from '@/stores/dashboardStore';

const intervals = [
  { label: '关闭', value: 0 },
  { label: '30 秒', value: 30 },
  { label: '1 分钟', value: 60 },
  { label: '5 分钟', value: 300 },
  { label: '10 分钟', value: 600 },
  { label: '30 分钟', value: 1800 },
  { label: '1 小时', value: 3600 },
];

export function RefreshSettings() {
  const refreshInterval = useDashboardStore((s) => s.refreshInterval);
  const setRefreshInterval = useDashboardStore((s) => s.setRefreshInterval);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="font-semibold text-lg mb-4">自动刷新</h2>
      <div className="flex flex-wrap gap-2">
        {intervals.map((item) => (
          <button
            key={item.value}
            onClick={() => setRefreshInterval(item.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              refreshInterval === item.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
