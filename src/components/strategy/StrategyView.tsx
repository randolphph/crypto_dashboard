'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, Trash2, ChevronUp, FileUp, X, Plus } from 'lucide-react';
import { useStrategyStore, type StrategyTable } from '@/stores/strategyStore';
import { parseMarkdownTable, parseTableAuto } from '@/lib/markdown/parseTable';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const PLACEHOLDER = `| 代码 | 名称 | 当前 | 目标 | 还需买入 | 买入价位 | 备注 |
|------|------|------|------|----------|----------|------|
| NVDA | 英伟达 | 100 | 200 | 100 | 150 / 140 / 130 | 分三批 |
| TSM  | 台积电 | 50  | 120 | 70  | 195 / 185      | 等回调 |`;

function formatImportedAt(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type SseStatus = 'connecting' | 'open' | 'error';

export function StrategyView() {
  const tables = useStrategyStore((s) => s.tables);
  const addTable = useStrategyStore((s) => s.addTable);
  const clearAll = useStrategyStore((s) => s.clearAll);
  const ingestServerTables = useStrategyStore((s) => s.ingestServerTables);

  // Zustand persist hydrates on the client only — render an empty shell on
  // first paint so SSR markup matches client first render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Live channel for AI-pushed tables. EventSource auto-reconnects when the
  // server closes the stream every ~50s, so we just register handlers once.
  const [sseStatus, setSseStatus] = useState<SseStatus>('connecting');
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    const es = new EventSource('/api/strategy/stream');
    const handle = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { tables?: StrategyTable[] };
        if (Array.isArray(data.tables)) ingestServerTables(data.tables);
      } catch {
        // ignore malformed frames
      }
    };
    es.addEventListener('snapshot', handle);
    es.addEventListener('tables', handle);
    es.onopen = () => setSseStatus('open');
    es.onerror = () => setSseStatus('error');
    return () => {
      es.close();
    };
  }, [hydrated, ingestServerTables]);

  const [showImport, setShowImport] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Open import panel by default when there's no table yet.
  const importOpen = showImport || (hydrated && tables.length === 0);

  const handleImport = () => {
    setError(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setError('请粘贴 markdown 表格内容，或选择文件上传');
      return;
    }
    const parsed = parseMarkdownTable(trimmed);
    if (!parsed) {
      setError('未能解析出表格。请确认是 markdown 表格格式（每行用 | 分列）。');
      return;
    }
    addTable({
      headers: parsed.headers,
      rows: parsed.rows,
      raw: trimmed,
      importedAt: Date.now(),
      note: note.trim() || undefined,
    });
    setText('');
    setNote('');
  };

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const content = await file.text();
      const parsed = parseTableAuto(content, file.name);
      if (!parsed) {
        setError(
          `无法从「${file.name}」解析出表格。支持 markdown / csv / tsv / txt。`
        );
        return;
      }
      addTable({
        headers: parsed.headers,
        rows: parsed.rows,
        raw: content,
        importedAt: Date.now(),
        note: note.trim() || file.name,
      });
      setText('');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleClearAll = async () => {
    if (!confirm(`确认清空全部 ${tables.length} 张策略表？此操作不可撤销。`)) return;
    // Server-side clear first so a refresh doesn't resurrect keyed tables.
    // We swallow errors but warn — the local clear still runs so the UI is
    // never "stuck" with a dialog the user wanted to confirm.
    try {
      const res = await fetch('/api/strategy?all=1', { method: 'DELETE' });
      if (!res.ok && res.status !== 500) {
        console.warn('[strategy] DELETE all failed:', res.status);
      }
    } catch (e) {
      console.warn('[strategy] DELETE all error:', e);
    }
    clearAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="h-6 w-6" />
            AI 策略
            <SseBadge status={sseStatus} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            手动粘贴/上传，或让 AI 通过 <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /api/strategy</code> 推送，浏览器会实时收到新表。
            本地的编辑保留在浏览器，AI 推送过来的会自动出现在顶部。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowImport((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent"
          >
            {importOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
              </>
            )}
            {importOpen ? '收起' : '新增导入'}
          </button>
          {hydrated && tables.length > 0 && (
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
              清空全部
            </button>
          )}
        </div>
      </div>

      {importOpen && (
        <section className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">导入策略表</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                粘贴 markdown 表格，或上传 .md / .txt / .csv / .tsv 文件。每次导入会新增一张表，不覆盖已有数据。
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-accent"
            >
              <FileUp className="h-4 w-4" />
              上传文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt,.csv,.tsv,text/markdown,text/plain,text/csv,text/tab-separated-values"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className="h-56 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs leading-relaxed shadow-inner focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注（可选，如：基于今日盘前；模型 GPT-x 等）"
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={handleImport}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Upload className="h-4 w-4" />
              导入粘贴内容
            </button>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </section>
      )}

      {hydrated && tables.map((t) => (
        <StrategyTableSection key={t.id} table={t} />
      ))}

      {hydrated && tables.length === 0 && !importOpen && (
        <p className="text-sm text-muted-foreground">还没有导入过 AI 策略表。</p>
      )}
    </div>
  );
}

function StrategyTableSection({ table }: { table: StrategyTable }) {
  const updateCell = useStrategyStore((s) => s.updateCell);
  const updateHeader = useStrategyStore((s) => s.updateHeader);
  const updateNote = useStrategyStore((s) => s.updateNote);
  const removeRow = useStrategyStore((s) => s.removeRow);
  const removeTable = useStrategyStore((s) => s.removeTable);

  const handleDelete = async () => {
    if (!confirm('确认删除此策略表？')) return;
    // Keyed tables live on the server; tell it to forget first so the next
    // SSE snapshot doesn't put the table back. Unkeyed tables (locally
    // imported via paste/file) only exist client-side, skip the network.
    if (table.key) {
      try {
        const res = await fetch(
          `/api/strategy?key=${encodeURIComponent(table.key)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          alert(`服务端删除失败 (${res.status})，本地未删除。请重试。`);
          return;
        }
      } catch (e) {
        alert(
          `服务端删除失败：${e instanceof Error ? e.message : String(e)}。本地未删除。`
        );
        return;
      }
    }
    removeTable(table.id);
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-semibold">策略表</h2>
            {table.key && (
              <span
                title="AI 推送时使用的记号；相同记号下次推送会覆盖此表"
                className="rounded-full border bg-secondary/40 px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground"
              >
                {table.key}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              导入于 {formatImportedAt(table.importedAt)} · {table.rows.length} 行 · {table.headers.length} 列
            </span>
          </div>
          <div className="mt-1 max-w-md text-xs text-muted-foreground">
            <EditableText
              value={table.note ?? ''}
              onChange={(v) => updateNote(table.id, v)}
              placeholder="点击添加备注"
              align="left"
            />
          </div>
        </div>
        <button
          onClick={handleDelete}
          title="删除此表"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
          删除
        </button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {table.headers.map((h, ci) => (
                <TableHead key={ci} className="text-center">
                  <EditableText
                    value={h}
                    onChange={(v) => updateHeader(table.id, ci, v)}
                  />
                </TableHead>
              ))}
              <TableHead className="w-8 p-0" aria-label="操作" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row, ri) => (
              <TableRow key={ri} className="group">
                {row.map((cell, ci) => (
                  <TableCell
                    key={ci}
                    className="whitespace-pre-wrap break-words text-center"
                  >
                    <EditableText
                      value={cell}
                      onChange={(v) => updateCell(table.id, ri, ci, v)}
                    />
                  </TableCell>
                ))}
                <TableCell className="w-8 p-0 text-center">
                  <button
                    onClick={() => removeRow(table.id, ri)}
                    title="删除此行"
                    className="rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function SseBadge({ status }: { status: SseStatus }) {
  const meta =
    status === 'open'
      ? { dot: 'bg-emerald-500', label: '实时' }
      : status === 'connecting'
        ? { dot: 'bg-amber-500', label: '连接中' }
        : { dot: 'bg-red-500', label: '重连中' };
  return (
    <span
      title={`AI 推送通道：${meta.label}`}
      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 align-middle text-[10px] font-medium text-muted-foreground"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}

// Click-to-edit text. Display as a span; on click swap to an input; Enter or
// blur commits, Esc cancels. Used for every cell, every header, and the note.
function EditableText({
  value,
  onChange,
  placeholder,
  align = 'center',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const alignCls =
    align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className={cn(
          'w-full rounded-sm border bg-background px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring',
          alignCls
        )}
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        'block w-full min-h-[1.25rem] cursor-text rounded-sm px-1 py-0.5 hover:bg-muted/50',
        alignCls
      )}
    >
      {value || (
        <span className="text-muted-foreground">{placeholder ?? '—'}</span>
      )}
    </span>
  );
}
