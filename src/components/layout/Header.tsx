'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Target, Settings, ScrollText } from 'lucide-react';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { PrivacyToggle } from '@/components/common/PrivacyToggle';
import { RefreshControl } from '@/components/dashboard/RefreshControl';
import { FxBadge } from '@/components/layout/FxBadge';
import { WalletStatus } from '@/components/auth/WalletStatus';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: '资产看板', icon: BarChart3 },
  { href: '/transactions', label: '交易账本', icon: ScrollText },
  { href: '/accumulation', label: 'AI 加仓', icon: Target },
  { href: '/settings', label: '设置', icon: Settings },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-3 sm:px-6">
        <div className="mr-3 flex items-center gap-2 sm:mr-8">
          <BarChart3 className="h-6 w-6" />
          <span className="hidden text-lg font-bold xl:inline">Crypto Dashboard</span>
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                pathname === item.href
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <div className="hidden lg:block"><FxBadge /></div>
          <WalletStatus />
          <RefreshControl />
          <PrivacyToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
