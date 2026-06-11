import {
  upsertTable,
  deleteTable,
  deleteAllTables,
  isStrategyConfigured,
  listTables,
} from '@/lib/strategy/serverStore';
import {
  parseMarkdownTable,
  parseTableAuto,
  type ParsedTable,
} from '@/lib/markdown/parseTable';

export const dynamic = 'force-dynamic';
// Use the default Node runtime: route handlers here read env vars and call the
// Upstash REST SDK; nothing requires Edge.

const MAX_COLS = 50;
const MAX_ROWS = 500;
const MAX_CELL_LEN = 4_000;
const DEFAULT_KEY = 'default';
const MAX_KEY_LEN = 100;
// Strict-but-friendly: ascii letters/digits + `-_.:` only. Lets the AI use
// things like `daily-watchlist` or `us:tech:2026-06-11` without opening the
// door to weird unicode or whitespace.
const KEY_RE = /^[A-Za-z0-9._:\-]{1,100}$/;

function authorized(request: Request): boolean {
  const expected = process.env.STRATEGY_PUSH_TOKEN?.trim();
  // If no token is configured we treat the endpoint as locked down rather
  // than open: failing closed is safer for a public deployment.
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  return timingSafeEqual(m[1].trim(), expected);
}

// Constant-time string compare to keep the token check from being a side-
// channel oracle. JS comparators bail at the first mismatched byte; this
// always scans both.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface PostBody {
  key?: unknown;
  headers?: unknown;
  rows?: unknown;
  text?: unknown;
  format?: unknown;
  note?: unknown;
  importedAt?: unknown;
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function normalizeStructured(
  headers: string[],
  rowsIn: string[][]
): ParsedTable | null {
  if (headers.length === 0) return null;
  if (headers.length > MAX_COLS) return null;
  const cols = headers.length;
  const rows: string[][] = [];
  for (const r of rowsIn) {
    if (rows.length >= MAX_ROWS) break;
    let row = r.slice(0, cols);
    if (row.length < cols) {
      row = [...row, ...Array(cols - row.length).fill('')];
    }
    rows.push(row.map((c) => c.slice(0, MAX_CELL_LEN)));
  }
  if (rows.length === 0) return null;
  return {
    headers: headers.map((h) => h.slice(0, MAX_CELL_LEN)),
    rows,
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!isStrategyConfigured()) {
    return Response.json(
      { ok: false, error: 'redis not configured' },
      { status: 500 }
    );
  }
  const tables = await listTables();
  return Response.json({ ok: true, tables });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!isStrategyConfigured()) {
    return Response.json(
      { ok: false, error: 'redis not configured' },
      { status: 500 }
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json(
      { ok: false, error: 'invalid json body' },
      { status: 400 }
    );
  }

  // Prefer structured input. Fall back to parsing the markdown/csv/tsv text.
  let parsed: ParsedTable | null = null;
  let rawSource = '';

  if (body.headers !== undefined || body.rows !== undefined) {
    if (!isStringArray(body.headers)) {
      return Response.json(
        { ok: false, error: 'headers must be string[]' },
        { status: 400 }
      );
    }
    if (
      !Array.isArray(body.rows) ||
      !body.rows.every((r) => isStringArray(r))
    ) {
      return Response.json(
        { ok: false, error: 'rows must be string[][]' },
        { status: 400 }
      );
    }
    parsed = normalizeStructured(body.headers, body.rows as string[][]);
    rawSource = JSON.stringify({ headers: body.headers, rows: body.rows });
  } else if (typeof body.text === 'string') {
    rawSource = body.text;
    const fmt =
      typeof body.format === 'string'
        ? body.format.toLowerCase()
        : undefined;
    if (fmt === 'markdown' || fmt === 'md') {
      parsed = parseMarkdownTable(body.text);
    } else if (fmt) {
      parsed = parseTableAuto(body.text, `payload.${fmt}`);
    } else {
      parsed = parseTableAuto(body.text);
    }
  } else {
    return Response.json(
      {
        ok: false,
        error: 'provide either {headers, rows} or {text, format?}',
      },
      { status: 400 }
    );
  }

  if (!parsed) {
    return Response.json(
      { ok: false, error: 'could not parse a table from payload' },
      { status: 422 }
    );
  }

  const note =
    typeof body.note === 'string' && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : undefined;
  const importedAt =
    typeof body.importedAt === 'number' && Number.isFinite(body.importedAt)
      ? body.importedAt
      : undefined;

  // Identity for upsert. Same key = overwrite previous push, so the caller
  // can update a "daily watchlist" continuously without piling up entries.
  // Missing key defaults to "default" so casual callers still get sensible
  // single-bucket behavior.
  let key = DEFAULT_KEY;
  if (body.key !== undefined) {
    if (typeof body.key !== 'string') {
      return Response.json(
        { ok: false, error: 'key must be a string' },
        { status: 400 }
      );
    }
    const trimmed = body.key.trim();
    if (!KEY_RE.test(trimmed)) {
      return Response.json(
        {
          ok: false,
          error: `invalid key: must match ${KEY_RE.source} (max ${MAX_KEY_LEN} chars)`,
        },
        { status: 400 }
      );
    }
    key = trimmed;
  }

  const table = await upsertTable({
    key,
    headers: parsed.headers,
    rows: parsed.rows,
    raw: rawSource,
    note,
    importedAt,
  });

  return Response.json(
    {
      ok: true,
      key: table.key,
      id: table.id,
      importedAt: table.importedAt,
      rows: table.rows.length,
      cols: table.headers.length,
    },
    { status: 201 }
  );
}

// Deletion is intentionally unauthenticated to match the GET/SSE posture —
// the dashboard URL is the soft gate. Reads and writes from the browser go
// here freely; POST (AI push from outside) is the only path that requires
// the bearer token. If the dashboard URL is ever made public, tighten this.
export async function DELETE(request: Request) {
  if (!isStrategyConfigured()) {
    return Response.json(
      { ok: false, error: 'redis not configured' },
      { status: 500 }
    );
  }
  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all');
  if (all === '1' || all === 'true') {
    await deleteAllTables();
    return Response.json({ ok: true, deleted: 'all' });
  }
  const key = searchParams.get('key');
  if (!key) {
    return Response.json(
      { ok: false, error: 'missing ?key=… or ?all=1' },
      { status: 400 }
    );
  }
  if (!KEY_RE.test(key)) {
    return Response.json(
      { ok: false, error: 'invalid key format' },
      { status: 400 }
    );
  }
  const removed = await deleteTable(key);
  return Response.json({ ok: true, key, removed });
}
