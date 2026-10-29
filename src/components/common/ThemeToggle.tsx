'use client';

import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { Popover } from '@base-ui/react/popover';
import { useTheme } from 'next-themes';
import { useColorScheme } from '@/hooks/useColorScheme';
import type { ColorScheme } from '@/lib/theme/colorScheme';

const PALETTES: Array<{ id: ColorScheme; name: string; description: string; colors: string[] }> = [
  { id: 'classic', name: '经典', description: '默认 · 原来的黑白灰与彩色图表', colors: ['#171717', '#3b82f6', '#10b981', '#f59e0b'] },
  { id: 'palm', name: 'Palm · 椰林绿', description: '纸灰、森林绿与麦黄', colors: ['#58402E', '#43593B', '#ACAD79', '#F2D17E'] },
];
const MODES = [
  { id: 'light', name: '浅色', Icon: Sun },
  { id: 'dark', name: '深色', Icon: Moon },
  { id: 'system', name: '跟随系统', Icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { colorScheme, setColorScheme } = useColorScheme();
  return <Popover.Root>
    <Popover.Trigger aria-label="外观设置" title="外观设置" className="inline-flex items-center justify-center rounded-md p-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Palette aria-hidden="true" className="h-5 w-5" />
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-[60]">
        <Popover.Popup className="w-72 max-w-[calc(100vw-1rem)] rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
          <Popover.Title className="px-1 text-sm font-semibold">外观设置</Popover.Title>
          <div role="group" aria-label="配色主题" className="mt-3 space-y-1.5">
            {PALETTES.map(palette => <button key={palette.id} type="button" aria-pressed={colorScheme === palette.id} aria-label={`使用${palette.name}主题`}
              onClick={() => setColorScheme(palette.id)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${colorScheme === palette.id ? 'border-primary/40 bg-accent' : 'border-transparent hover:bg-muted'}`}>
              <span aria-hidden="true" className="grid size-8 shrink-0 grid-cols-2 overflow-hidden rounded-full ring-1 ring-border">{palette.colors.map(color => <span key={color} style={{ backgroundColor: color }} />)}</span>
              <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{palette.name}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{palette.description}</span></span>
              {colorScheme === palette.id && <Check aria-hidden="true" className="size-3.5 text-primary" />}
            </button>)}
          </div>
          <div role="group" aria-label="明暗模式" className="mt-3 grid grid-cols-[1fr_1fr_1.3fr] gap-1 border-t pt-3">
            {MODES.map(({ id, name, Icon }) => <button key={id} type="button" aria-label={`使用${name}模式`} aria-pressed={(theme ?? 'system') === id} onClick={() => setTheme(id)}
              className={`flex items-center justify-center gap-1 rounded-md px-1 py-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${(theme ?? 'system') === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
              <Icon aria-hidden="true" className="size-3.5" />{name}
            </button>)}
          </div>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
