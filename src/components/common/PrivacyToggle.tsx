'use client';

import { Eye, EyeOff } from 'lucide-react';
import { usePrivacyStore } from '@/stores/privacyStore';

export function PrivacyToggle() {
  const hidden = usePrivacyStore((s) => s.hidden);
  const toggle = usePrivacyStore((s) => s.toggle);

  return (
    <button
      onClick={toggle}
      title={hidden ? '显示数字' : '隐藏数字'}
      className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      <span className="sr-only">切换隐私模式</span>
    </button>
  );
}
