import 'server-only';
import { redis } from '@/lib/cache/upstash';
import {
  emptyGate,
  type GateState,
  type SectorArm,
} from '@/types/accumulation';

// Storage model: a single JSON blob at GATE_KEY holding the global switch and
// the per-sector arm map. VERSION_KEY is INCR'd on every mutation so the SSE
// stream can detect changes without re-reading the blob each tick — same shape
// as strategy/serverStore.
const GATE_KEY = 'accumulation:gate';
const VERSION_KEY = 'accumulation:gate_version';

export function isGateConfigured(): boolean {
  return redis !== null;
}

export async function getGate(): Promise<GateState> {
  if (!redis) return emptyGate();
  const stored = await redis.get<Omit<GateState, 'version'>>(GATE_KEY);
  const version = (await redis.get<number>(VERSION_KEY)) ?? 0;
  if (!stored) return { ...emptyGate(), version };
  return {
    open: !!stored.open,
    sectors: stored.sectors ?? {},
    version,
  };
}

export async function getVersion(): Promise<number> {
  if (!redis) return 0;
  return (await redis.get<number>(VERSION_KEY)) ?? 0;
}

async function persist(gate: Omit<GateState, 'version'>): Promise<GateState> {
  if (!redis) throw new Error('Redis not configured');
  await redis.set(GATE_KEY, gate);
  const version = await redis.incr(VERSION_KEY);
  return { ...gate, version };
}

export async function setOpen(open: boolean): Promise<GateState> {
  const current = await getGate();
  return persist({ open, sectors: current.sectors });
}

export async function setSectorArm(
  sector: string,
  arm: SectorArm
): Promise<GateState> {
  const current = await getGate();
  return persist({
    open: current.open,
    sectors: { ...current.sectors, [sector]: arm },
  });
}
