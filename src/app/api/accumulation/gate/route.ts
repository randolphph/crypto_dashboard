import {
  getGate,
  setOpen,
  setSectorArm,
  isGateConfigured,
} from '@/lib/accumulation/serverStore';
import type { SectorArm } from '@/types/accumulation';

export const dynamic = 'force-dynamic';

const MAX_SECTOR_LEN = 100;

export async function GET() {
  if (!isGateConfigured()) {
    return Response.json(
      { ok: false, error: 'redis not configured' },
      { status: 500 }
    );
  }
  const gate = await getGate();
  return Response.json({ ok: true, gate });
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
  if (!isGateConfigured()) {
    return Response.json(
      { ok: false, error: 'redis not configured' },
      { status: 500 }
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json(
      { ok: false, error: 'invalid json body' },
      { status: 400 }
    );
  }

  if (typeof body.open === 'boolean') {
    const gate = await setOpen(body.open);
    return Response.json({ ok: true, gate });
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
    return Response.json({ ok: true, gate });
  }

  return Response.json(
    { ok: false, error: 'provide { open } or { sector, arm }' },
    { status: 400 }
  );
}
