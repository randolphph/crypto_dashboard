import type { StockMarket } from '@/types/stocks';

// ── AI 加仓计划 (read-only) ────────────────────────────────────────────────
// A target is the *plan* for one symbol: where you want to end up (targetValue)
// and at which prices you'd add (three dynamic anchors derived from the 20-day
// moving average). It is hand-maintained — everything that can drift (tier
// prices, per-tier budget, gap-to-target, trigger proximity) is DERIVED at
// render time in `lib/accumulation/derive.ts`, never stored, so a single edit
// to `ma20` reprices the whole ladder and live value movement keeps budgets
// honest.
//
// There is intentionally NO order/execution field anywhere in this module —
// it is a visualization only.

export type TargetStatus = 'active' | 'paused' | 'done';

export interface AccumulationTarget {
  id: string;
  symbol: string;
  // Reuse the dashboard's market enum so the join against live stock data
  // (IBKR + 同花顺) keys cleanly on `market:symbol`.
  market: StockMarket;
  sector: string;
  // 20-day moving average, hand-maintained. The anchor ladder hangs off this.
  ma20: number;
  // Three anchor offsets relative to ma20: price = ma20 * (1 + offset). Buying
  // dips → negative offsets, e.g. [-0.03, -0.06, -0.10]. 档1 always hangs off
  // ma20 via tierOffsets[0]; tierOffsets[1]/[2] are the fallback for 档2/档3
  // when relRatios is absent.
  tierOffsets: [number, number, number];
  // Optional override for 档2/档3 anchor prices, expressed as a relative drop
  // off 档1's anchor price: price = tier1Price * (1 − r). Two entries [r2, r3],
  // each an independent fraction (0.03 = 3% below 档1). When set it takes
  // precedence over tierOffsets[1]/[2]; 档1 is unaffected. Edited inline in the
  // 三档锚价 column.
  relRatios?: [number, number];
  // How the *remaining* budget (targetValue − liveCurrentValue) is split across
  // the three tiers. Defaults to [0.3, 0.3, 0.4] when omitted.
  budgetRatios?: [number, number, number];
  // Target USD market value for this name once fully built.
  targetValue: number;
  // Optional snapshot of current value at edit time — purely informational.
  // The number shown in the UI is always the LIVE value from useStockData().
  currentValueSnapshot?: number;
  status: TargetStatus;
  note?: string;
}

export const DEFAULT_BUDGET_RATIOS: [number, number, number] = [0.3, 0.3, 0.4];

export const TARGET_STATUS_LABEL: Record<TargetStatus, string> = {
  active: '执行中',
  paused: '暂停',
  done: '已完成',
};

// ── 闸门 (Redis-backed shared switch) ──────────────────────────────────────
// A global gate plus per-sector arming. When the gate is closed, or a sector
// is paused, the dashboard stops flagging "接近触发档位" for that scope — it is
// a DISPLAY switch, never wired to anything that could place an order.

export type SectorArm = 'armed' | 'paused';

export interface GateState {
  open: boolean;
  // sector name → arm state. Absent sectors default to 'armed' when the gate
  // is open.
  sectors: Record<string, SectorArm>;
  // INCR'd on every mutation; the SSE stream polls this to detect changes.
  version: number;
}

export function emptyGate(): GateState {
  return { open: false, sectors: {}, version: 0 };
}

export function isSectorArmed(gate: GateState, sector: string): boolean {
  if (!gate.open) return false;
  return (gate.sectors[sector] ?? 'armed') === 'armed';
}
