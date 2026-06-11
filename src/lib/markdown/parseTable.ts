// Lenient GFM-table parser. AI output sometimes drops the leading/trailing
// pipe, omits the --- separator row, or has rows of inconsistent width — we
// accept all of that and just normalize to {headers, rows}.
//
// Also exposes a CSV/TSV parser and an auto-detecting entry point so file
// imports (.md/.txt/.csv/.tsv) can share one code path.

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

const SEPARATOR_RE = /^\s*:?-{2,}:?\s*$/;

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => SEPARATOR_RE.test(c));
}

export function parseMarkdownTable(input: string): ParsedTable | null {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes('|'));

  if (lines.length === 0) return null;

  const rows = lines.map(splitRow);

  let headerIdx = 0;
  // Skip a possible leading separator row (rare but seen).
  while (headerIdx < rows.length && isSeparatorRow(rows[headerIdx])) headerIdx++;
  if (headerIdx >= rows.length) return null;

  const headers = rows[headerIdx];
  const cols = headers.length;
  if (cols === 0) return null;

  const body: string[][] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (isSeparatorRow(r)) continue;
    // Pad short rows, trim overlong ones — AI output may be ragged.
    if (r.length < cols) {
      body.push([...r, ...Array(cols - r.length).fill('')]);
    } else if (r.length > cols) {
      body.push(r.slice(0, cols));
    } else {
      body.push(r);
    }
  }

  if (body.length === 0) return null;

  return { headers, rows: body };
}

// RFC4180-ish delimited parser. Supports `"..."` quoted fields with `""`
// escapes and newlines inside quoted fields. Trims surrounding whitespace
// outside quotes.
export function parseDelimited(
  input: string,
  delim: ',' | '\t'
): ParsedTable | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQ) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') {
      inQ = true;
      continue;
    }
    if (c === delim) {
      row.push(field.trim());
      field = '';
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c !== ''));
  if (nonEmpty.length === 0) return null;

  const headers = nonEmpty[0];
  const cols = headers.length;
  if (cols === 0) return null;

  const body = nonEmpty.slice(1).map((r) => {
    if (r.length < cols) return [...r, ...Array(cols - r.length).fill('')];
    if (r.length > cols) return r.slice(0, cols);
    return r;
  });
  if (body.length === 0) return null;
  return { headers, rows: body };
}

// Auto-detect: dispatch by filename extension when known, otherwise sniff
// the first non-empty line for the dominant delimiter (| / tab / comma).
export function parseTableAuto(
  text: string,
  filename?: string
): ParsedTable | null {
  const ext = filename?.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') return parseDelimited(text, ',');
  if (ext === 'tsv') return parseDelimited(text, '\t');
  if (ext === 'md' || ext === 'markdown') return parseMarkdownTable(text);

  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const pipes = (first.match(/\|/g) ?? []).length;
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;

  if (pipes >= 1 && pipes >= tabs && pipes >= commas) {
    return parseMarkdownTable(text);
  }
  if (tabs >= 1 && tabs >= commas) return parseDelimited(text, '\t');
  if (commas >= 1) return parseDelimited(text, ',');
  return parseMarkdownTable(text);
}
