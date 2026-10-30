'use client';

import {
  createLucideIcon,
  Wallet,
  LineChart,
  Landmark,
  Box,
  Coins,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// All platform marks share Lucide's 24-unit grid and display size.
const BinanceMark = createLucideIcon('SourceBinance', [
  ['path', { d: 'M12 2 18 8 15.5 10.5 12 7 8.5 10.5 6 8Z M4 9.5 6.5 12 4 14.5 1.5 12Z M20 9.5 22.5 12 20 14.5 17.5 12Z M12 9.5 14.5 12 12 14.5 9.5 12Z M6 16 8.5 13.5 12 17 15.5 13.5 18 16 12 22Z', fill: 'currentColor', stroke: 'none', key: 'diamonds' }],
]);
const OkxMark = createLucideIcon('SourceOkx', [
  ['path', { d: 'M3 3h6v6H3Z M15 3h6v6h-6Z M9 9h6v6H9Z M3 15h6v6H3Z M15 15h6v6h-6Z', fill: 'currentColor', stroke: 'none', key: 'blocks' }],
]);
const DeribitLine = createLucideIcon('SourceDeribit', [
  ['path', { d: 'M3 6h10a6 6 0 0 1 0 12H3 M6 6v12 M9 3v3 M13 3v3 M9 18v3 M13 18v3', key: 'symbol' }],
]);
const TonghuashunLine = createLucideIcon('SourceTonghuashun', [
  ['path', { d: 'M5 12v3m0 5v2 M12 7v3m0 6v3 M19 2v3m0 7v3', key: 'wicks' }],
  ['rect', { x: '3', y: '15', width: '4', height: '5', rx: '0.5', key: 'first' }],
  ['rect', { x: '10', y: '10', width: '4', height: '6', rx: '0.5', key: 'second' }],
  ['rect', { x: '17', y: '5', width: '4', height: '7', rx: '0.5', key: 'third' }],
]);
const IbkrLine = createLucideIcon('SourceIbkr', [
  ['path', { d: 'M4 21V11l8-9-4 12v7 M12 21v-1a4 4 0 0 1 8 0v1', key: 'figure' }],
  ['circle', { cx: '16', cy: '12', r: '3', key: 'head' }],
]);

const exchangeColor = 'text-warning classic:text-amber-500';
const brokerColor = 'text-primary classic:text-blue-500';
const platformIcons = {
  binance: { Icon: BinanceMark, colorClass: 'text-[#f3ba2f]' },
  okx: { Icon: OkxMark, colorClass: 'text-black dark:text-white' },
  deribit: { Icon: DeribitLine, colorClass: exchangeColor },
  tonghuashun: { Icon: TonghuashunLine, colorClass: brokerColor },
  ibkr: { Icon: IbkrLine, colorClass: brokerColor },
};

function platformIcon(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized.startsWith('binance')) return platformIcons.binance;
  if (normalized.startsWith('okx')) return platformIcons.okx;
  if (normalized.startsWith('deribit')) return platformIcons.deribit;
  if (normalized.startsWith('ibkr')) return platformIcons.ibkr;
  if (normalized.startsWith('a股') || normalized.startsWith('同花顺')) return platformIcons.tonghuashun;
  return undefined;
}

// Sources without a platform glyph use their category icon.
function classify(
  label: string
): { Icon: LucideIcon; colorClass: string } {
  if (label === '黄金') return { Icon: Coins, colorClass: 'text-warning classic:text-yellow-600' };
  // On-chain
  if (label === '链上') {
    return { Icon: Wallet, colorClass: 'text-primary classic:text-purple-500' };
  }
  // Stock brokers — labels come from BROKER_LABEL; prefix-match keeps
  // "IBKR 现金" / "长桥 现金" working too.
  if (
    label.startsWith('IBKR') ||
    label.startsWith('长桥') ||
    label.startsWith('A股') ||
    label.startsWith('LongPort')
  ) {
    return { Icon: LineChart, colorClass: 'text-primary classic:text-blue-500' };
  }
  // Bank rollup ("银行") and any user-typed bank name. This is also the
  // catch-all so unrecognised cash-like sources still get a reasonable glyph.
  if (label === '银行') {
    return { Icon: Landmark, colorClass: 'text-positive classic:text-emerald-500' };
  }
  // Custom assets fall through to a generic box. Banks the user typed in
  // (招商银行, 汇丰, 支付宝, …) also land here — Landmark reads as
  // "institution" without being bank-specific, so prefer it as the default
  // for anything we don't otherwise know about.
  return { Icon: Landmark, colorClass: 'text-positive classic:text-emerald-500' };
}

// Generic fallback for things that clearly aren't an institution (custom
// asset names entered by the user). Picked when caller passes `kind="other"`.
export function getCustomAssetIcon(): {
  Icon: LucideIcon;
  colorClass: string;
} {
  return { Icon: Box, colorClass: 'text-primary classic:text-violet-500' };
}

interface Props {
  label: string;
  className?: string;
  // Force the generic-other icon (for custom assets) instead of inferring
  // from the label string.
  kind?: 'auto' | 'other';
}

export function SourceIcon({ label, className, kind = 'auto' }: Props) {
  const platform = kind === 'auto' ? platformIcon(label) : undefined;
  const { Icon, colorClass } =
    platform ?? (kind === 'other' ? getCustomAssetIcon() : classify(label));
  return (
    <span data-source-icon data-platform-logo={platform ? label : undefined} aria-hidden="true" className={cn('inline-flex h-5 w-6 shrink-0 items-center justify-center', className)}>
      <Icon className={cn('size-3.5 shrink-0', colorClass)} />
    </span>
  );
}
