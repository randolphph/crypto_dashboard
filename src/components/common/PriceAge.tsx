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

export function PriceAge({ updatedAt }: { updatedAt?: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  if (now === null || !Number.isFinite(timestamp)) return null;

  const ageMs = Math.max(0, now - timestamp);
  return (
    <span
      title={`报价抓取时间：${new Date(timestamp).toLocaleString()}`}
      className={cn(
        'mt-0.5 inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] leading-none',
        ageMs >= 60 * 60_000
          ? 'text-red-600 dark:text-red-400'
          : ageMs >= 2 * 60_000
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground'
      )}
    >
      <Clock3 className="h-2.5 w-2.5" />
      {relativeAge(ageMs)}
    </span>
  );
}
