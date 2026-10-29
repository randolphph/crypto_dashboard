import type { EnrichedPosition } from '@/types/stocks';

export function buildAShareRanking(positions: EnrichedPosition[]) {
  const holdings = positions.filter(p => p.broker === 'ths' && Number.isFinite(p.shares) && p.shares !== 0);
  const ranked = holdings.filter(p => p.market === 'A' && p.currency === 'CNY' && p.kind !== 'option'
    && Number.isFinite(p.marketValue) && p.marketValue >= 0 && Number.isFinite(p.price)
    && (p.price > 0 || p.price === 0 && (p.priceStatus === 'ok' || p.priceStatus === 'closed')))
    .sort((a, b) => b.marketValue - a.marketValue || a.id.localeCompare(b.id));
  const total = ranked.reduce((sum, p) => sum + p.marketValue, 0);
  const maximum = ranked[0]?.marketValue ?? 0;
  const roughUnit = maximum > 0 ? maximum / 40 : 1;
  const power = 10 ** Math.floor(Math.log10(roughUnit));
  const unit = Math.max(.01, [1, 2, 2.5, 5, 10].map(n => n * power).find(n => n >= roughUnit)!);
  const slots = Math.max(1, Math.ceil(maximum / unit));
  const rows = ranked.map(position => {
    const units = position.marketValue / unit;
    return { position, share: total > 0 ? position.marketValue / total * 100 : 0,
      ticks: Array.from({ length: Math.ceil(units) }, (_, index) => Math.min(1, units - index)) };
  });
  const included = new Set(ranked.map(p => p.id));
  return { rows, total, unit, slots, omitted: holdings.filter(p => !included.has(p.id)) };
}
