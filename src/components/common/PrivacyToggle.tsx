'use client';

import { Eye, EyeOff } from 'lucide-react';
import { usePrivacyStore } from '@/stores/privacyStore';

export function PrivacyToggle() {
  const mode = usePrivacyStore((s) => s.mode);
  const toggle = usePrivacyStore((s) => s.toggle);

  return (
    <button
      onClick={toggle}
      type="button"
      data-privacy-mode={mode}
      aria-pressed={mode === 'amounts' ? 'mixed' : mode === 'hidden'}
      title={mode === 'visible' ? '当前全部显示；点击仅显示百分比' : mode === 'amounts' ? '当前仅显示百分比；点击隐藏全部数字' : '当前全部隐藏；点击显示全部数字'}
      className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {mode === 'hidden' ? <EyeOff className="h-5 w-5" /> : mode === 'visible' ? <Eye className="h-5 w-5" /> :
        <svg data-half-eye aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M2 12c3-3 6-4 10-4s7 1 10 4c-3 3-6 4-10 4S5 15 2 12Z" />
          <path d="M9 12h6a3 3 0 0 1-6 0" />
        </svg>}
      <span className="sr-only">切换隐私模式</span>
    </button>
  );
}
