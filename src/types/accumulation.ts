import type { StockMarket } from '@/types/stocks';

// ── AI 加仓计划 (read-only) ────────────────────────────────────────────────
// A target is an eligible symbol inside a sector plus the prices where it may
// be added. The portfolio has one overall target; sectors only describe the
// current holding mix, and individual symbols intentionally have no target
// amount. Everything that can
// drift (tier prices, gap-to-anchor, trigger proximity) is derived at render
// time in `lib/accumulation/derive.ts`.
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
  // Legacy fields kept only so previously saved plans can still hydrate. They
  // no longer affect any amount shown in the UI.
  budgetRatios?: [number, number, number];
  targetValue?: number;
  // Optional snapshot of current value at edit time — purely informational.
  // The number shown in the UI is always the LIVE value from useStockData().
  currentValueSnapshot?: number;
  status: TargetStatus;
  note?: string;
}

export const DEFAULT_AI_TARGET_PORTFOLIO_SHARE = 0.4;

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
  // Monotonic revision number, incremented on every shared-state mutation.
  version: number;
}

export function emptyGate(): GateState {
  return { open: false, sectors: {}, version: 0 };
}

export function isSectorArmed(gate: GateState, sector: string): boolean {
  if (!gate.open) return false;
  return (gate.sectors[sector] ?? 'armed') === 'armed';
}
