import {
  getGate,
  setOpen,
  setSectorArm,
  isGateConfigured,
} from '@/lib/accumulation/serverStore';
import type { SectorArm } from '@/types/accumulation';
import {
  enforceRateLimit,
  inputErrorResponse,
  readJsonBody,
} from '@/lib/http/guards';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const MAX_SECTOR_LEN = 100;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, 'gate:read', 30, 60);
  if (limited) return limited;

  if (!isGateConfigured()) {
    return Response.json(
      { ok: false, error: 'redis not configured' },
      { status: 500 }
    );
  }
  const gate = await getGate();
  return Response.json(
    { ok: true, gate },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

interface PatchBody {
  open?: unknown;
  sector?: unknown;
  arm?: unknown;
}

// PATCH toggles the global switch (`{ open }`) or arms/pauses one sector
// (`{ sector, arm }`). Display-only state — there is deliberately no path here
// that can submit an order. Reads/writes from the browser go freely (the
// dashboard URL is the soft gate).
export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, 'gate:write', 20, 60);
  if (limited) return limited;

  if (!isGateConfigured()) {
    return Response.json(
      { ok: false, error: 'redis not configured' },
      { status: 500 }
    );
  }

  let body: PatchBody;
  try {
    body = (await readJsonBody(request, 16 * 1024)) as PatchBody;
  } catch (error) {
    return inputErrorResponse(error);
  }

  if (typeof body.open === 'boolean') {
    const gate = await setOpen(body.open);
    return Response.json(
      { ok: true, gate },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  if (typeof body.sector === 'string') {
    const sector = body.sector.trim();
    if (!sector || sector.length > MAX_SECTOR_LEN) {
      return Response.json(
        { ok: false, error: 'invalid sector' },
        { status: 400 }
      );
    }
    if (body.arm !== 'armed' && body.arm !== 'paused') {
      return Response.json(
        { ok: false, error: "arm must be 'armed' or 'paused'" },
        { status: 400 }
      );
    }
    const gate = await setSectorArm(sector, body.arm as SectorArm);
    return Response.json(
      { ok: true, gate },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  return Response.json(
    { ok: false, error: 'provide { open } or { sector, arm }' },
    { status: 400 }
  );
}
