'use client';

import {
  Bitcoin,
  Wallet,
  LineChart,
  Landmark,
  Box,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Picks a venue-appropriate lucide icon for a breakdown label. Lucide doesn't
// ship brand logos so we fall back to category-level glyphs whose colors line
// up with the category palette used in PortfolioSummary (amber=crypto,
// blue=stocks, emerald=cash/bank, purple=onchain).
//
// The label can come from many places — straight venue ("Binance"), broker
// label ("A股 (同花顺)"), broker-cash compound ("IBKR 现金"), bank rollup
// ("银行"), or a user-typed bank name ("招商银行"). Match by prefix/contains
// so all of these get a sensible icon.
function classify(
  label: string
): { Icon: LucideIcon; colorClass: string } {
  // Crypto exchanges
  if (label === 'Binance' || label === 'OKX' || label === 'Deribit') {
    return { Icon: Bitcoin, colorClass: 'text-amber-500' };
  }
  // On-chain
  if (label === '链上') {
    return { Icon: Wallet, colorClass: 'text-purple-500' };
  }
  // Stock brokers — labels come from BROKER_LABEL; prefix-match keeps
  // "IBKR 现金" / "长桥 现金" working too.
  if (
    label.startsWith('IBKR') ||
    label.startsWith('长桥') ||
    label.startsWith('A股') ||
    label.startsWith('LongPort')
  ) {
    return { Icon: LineChart, colorClass: 'text-blue-500' };
  }
  // Bank rollup ("银行") and any user-typed bank name. This is also the
  // catch-all so unrecognised cash-like sources still get a reasonable glyph.
  if (label === '银行') {
    return { Icon: Landmark, colorClass: 'text-emerald-500' };
  }
  // Custom assets fall through to a generic box. Banks the user typed in
  // (招商银行, 汇丰, 支付宝, …) also land here — Landmark reads as
  // "institution" without being bank-specific, so prefer it as the default
  // for anything we don't otherwise know about.
  return { Icon: Landmark, colorClass: 'text-emerald-500' };
}

// Generic fallback for things that clearly aren't an institution (custom
// asset names entered by the user). Picked when caller passes `kind="other"`.
export function getCustomAssetIcon(): {
  Icon: LucideIcon;
  colorClass: string;
} {
  return { Icon: Box, colorClass: 'text-violet-500' };
}

interface Props {
  label: string;
  className?: string;
  // Force the generic-other icon (for custom assets) instead of inferring
  // from the label string.
  kind?: 'auto' | 'other';
}

export function SourceIcon({ label, className, kind = 'auto' }: Props) {
  const { Icon, colorClass } =
    kind === 'other' ? getCustomAssetIcon() : classify(label);
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', colorClass, className)} />;
}
