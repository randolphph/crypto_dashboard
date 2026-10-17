'use client';

import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

function relativeAge(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 10) return '刚刚';
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

export function PriceAge({ updatedAt, source, status, error }: { updatedAt?: string | null; source?: string; status?: string; error?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  if (now === null || (!Number.isFinite(timestamp) && !source)) return null;

  const ageMs = Math.max(0, now - timestamp);
  const sourceName = source ? ({ sina: '新浪', yahoo: 'Yahoo', tencent: '腾讯', naver: 'Naver', local: '本地备用', 'ibkr-flex': 'IBKR 报表' } as Record<string, string>)[source] ?? source : undefined;
  const notice = status === 'closed' ? '休市' : status === 'error' ? '更新失败' : status === 'stale' ? '行情延迟' : status === 'fallback' ? '备用估值' : undefined;
  return (
    <span
      title={[Number.isFinite(timestamp) ? `${source && source !== 'local' ? '行情时间' : '报价抓取时间'}：${new Date(timestamp).toLocaleString()}` : '行情时间未知', sourceName, source === 'local' ? '后台行情暂不可用，临时使用本地采价' : error].filter(Boolean).join(' · ')}
      className={cn(
        'mt-0.5 inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] leading-none',
        status === 'closed' ? 'text-muted-foreground' : status === 'error' || ageMs >= 60 * 60_000
          ? 'text-red-600 dark:text-red-400'
          : ageMs >= 2 * 60_000
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground'
      )}
    >
      <Clock3 className="h-2.5 w-2.5" />
      {[sourceName, notice, Number.isFinite(timestamp) ? relativeAge(ageMs) : undefined].filter(Boolean).join(' · ')}
    </span>
  );
}
