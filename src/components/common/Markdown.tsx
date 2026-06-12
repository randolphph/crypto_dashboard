'use client';

import { parseMarkdownTable } from '@/lib/markdown/parseTable';

// Minimal markdown renderer geared at AI chat replies. Streaming-friendly:
// every render is from-scratch from the full content string, so partial input
// still produces sensible output. Whitelisted subset: headings, paragraphs,
// bullet/ordered lists, blockquotes, code blocks, GFM tables, **bold**,
// *italic*, `inline code`, and bare links.
//
// Deliberately not pulling in react-markdown / remark — the bundle is overkill
// for this single chat surface and the project already has parseMarkdownTable.

interface Props {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: Props) {
  const blocks = parseBlocks(content);
  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ''}`}
    >
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'table'; raw: string }
  | { kind: 'hr' };

function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, '').trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push({ kind: 'code', lang, text: buf.join('\n') });
      continue;
    }

    // Blank
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ kind: 'heading', level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // HR
    if (/^---+$/.test(line)) {
      out.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push({ kind: 'quote', text: buf.join('\n') });
      continue;
    }

    // Table — consume a contiguous block of pipe-bearing lines
    if (line.includes('|')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        buf.push(lines[i]);
        i++;
      }
      // Only treat as table if there's a parseable result; else fall back to paragraph
      const parsed = parseMarkdownTable(buf.join('\n'));
      if (parsed && parsed.headers.length > 0 && parsed.rows.length > 0) {
        out.push({ kind: 'table', raw: buf.join('\n') });
        continue;
      }
      // Not a table — treat each line as paragraph
      for (const l of buf) out.push({ kind: 'paragraph', text: l });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      out.push({ kind: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push({ kind: 'ol', items });
      continue;
    }

    // Paragraph: collect until blank line / structural marker
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^---+$/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].includes('|')
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push({ kind: 'paragraph', text: buf.join(' ') });
  }

  return out;
}

function renderBlock(b: Block, key: number): React.ReactNode {
  switch (b.kind) {
    case 'heading': {
      const Tag = (`h${Math.min(6, Math.max(1, b.level))}`) as
        | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={key}>{renderInline(b.text)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{renderInline(b.text)}</p>;
    case 'ul':
      return (
        <ul key={key}>
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key}>
          {b.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote key={key}>
          <p>{renderInline(b.text)}</p>
        </blockquote>
      );
    case 'code':
      return (
        <pre key={key}>
          <code>{b.text}</code>
        </pre>
      );
    case 'hr':
      return <hr key={key} />;
    case 'table': {
      const parsed = parseMarkdownTable(b.raw);
      if (!parsed) return null;
      return (
        <table key={key}>
          <thead>
            <tr>
              {parsed.headers.map((h, i) => (
                <th key={i}>{renderInline(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{renderInline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  }
}

// Inline: `code`, **bold**, *italic*, [text](url), bare URLs. Order matters —
// code spans first so their contents aren't double-processed.
function renderInline(text: string): React.ReactNode[] {
  // Tokenise into segments: code | bold | italic | link | text
  const out: React.ReactNode[] = [];
  let rest = text;
  let key = 0;

  const patterns: Array<{
    re: RegExp;
    render: (m: RegExpMatchArray) => React.ReactNode;
  }> = [
    {
      re: /`([^`]+)`/,
      render: (m) => <code key={key++}>{m[1]}</code>,
    },
    {
      re: /\*\*([^*]+)\*\*/,
      render: (m) => <strong key={key++}>{m[1]}</strong>,
    },
    {
      re: /\*([^*]+)\*/,
      render: (m) => <em key={key++}>{m[1]}</em>,
    },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      render: (m) => (
        <a key={key++} href={m[2]} target="_blank" rel="noreferrer">
          {m[1]}
        </a>
      ),
    },
  ];

  while (rest.length > 0) {
    let earliest: {
      idx: number;
      m: RegExpMatchArray;
      render: (m: RegExpMatchArray) => React.ReactNode;
    } | null = null;
    for (const p of patterns) {
      const m = rest.match(p.re);
      if (m && m.index !== undefined) {
        if (!earliest || m.index < earliest.idx) {
          earliest = { idx: m.index, m, render: p.render };
        }
      }
    }
    if (!earliest) {
      out.push(<span key={key++}>{rest}</span>);
      break;
    }
    if (earliest.idx > 0) {
      out.push(<span key={key++}>{rest.slice(0, earliest.idx)}</span>);
    }
    out.push(earliest.render(earliest.m));
    rest = rest.slice(earliest.idx + earliest.m[0].length);
  }
  return out;
}
