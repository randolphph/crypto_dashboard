'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, StopCircle, Trash2 } from 'lucide-react';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { useVaultStore } from '@/stores/vaultStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { usePortfolioHistoryStore } from '@/stores/portfolioHistoryStore';
import { buildChatContext } from '@/lib/ai/context';
import { streamDeepseek, type ChatMessage } from '@/lib/ai/deepseek';
import { Markdown } from '@/components/common/Markdown';

const SUGGESTIONS = [
  '我现在加密、股票、现金的比例分别是多少？',
  '过去 30 天净值变化情况如何？',
  '我持仓最集中的三个标的是什么？分别多少 USD？',
  '帮我看一下期权头寸的风险敞口。',
];

// Cap on user/assistant pairs kept in chat history when calling the API.
// Older turns are dropped; the system prompt with snapshot data is always
// rebuilt fresh each turn, so older context isn't lost — only chitchat is.
const HISTORY_LIMIT_PAIRS = 6;

interface UiMessage extends ChatMessage {
  id: string;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPanel() {
  const status = useVaultStore((s) => s.status);
  const wallet = useVaultStore((s) => s.address);
  const apiKey = useApiKeyStore((s) => s.deepseekApiKey);
  const latest = useDashboardStore((s) => s.latestSnapshotPayload);
  const history = usePortfolioHistoryStore((s) => s.snapshots);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, streaming]);

  // Only show after vault is unlocked. Keeps the AI surface off the login
  // screen and avoids reading a null wallet.
  if (status !== 'authed') return null;

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;
    if (!apiKey) {
      setError('未配置 DeepSeek API Key。请在「设置 → API 密钥 → DeepSeek」中填入。');
      setOpen(true);
      return;
    }

    setError(null);
    const userMsg: UiMessage = { id: uid(), role: 'user', content: text.trim() };
    const assistantMsg: UiMessage = { id: uid(), role: 'assistant', content: '' };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const ctx = await buildChatContext({
        wallet,
        latest,
        history,
      });

      // Keep the last N pairs of recent dialogue (exclude the brand-new
      // empty assistantMsg from the wire payload).
      const recent = messages.slice(-HISTORY_LIMIT_PAIRS * 2);
      const wireMessages: ChatMessage[] = [
        { role: 'system', content: ctx.systemPrompt },
        ...recent.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg.content },
      ];

      let acc = '';
      for await (const delta of streamDeepseek({
        apiKey,
        messages: wireMessages,
        signal: ctrl.signal,
      })) {
        acc += delta;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: acc } : m
          )
        );
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User-initiated stop — keep whatever was streamed.
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        // Drop the empty assistant message if nothing came through.
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantMsg.id && m.content === ''))
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const clear = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform"
          title="问 AI"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[min(640px,calc(100vh-2.5rem))] w-[min(420px,calc(100vw-2.5rem))] flex-col rounded-2xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">资产 AI 助手</span>
              <span className="text-[10px] text-muted-foreground">DeepSeek</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clear}
                  disabled={streaming}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-50"
                  title="清空对话"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  这里能用自然语言问关于你资产的事——AI 会读你的最新快照、近 90 天净值曲线和历史快照摘要。
                </p>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">建议：</p>
                  {SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="block w-full rounded-md border bg-card px-3 py-2 text-left text-xs hover:bg-secondary"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                {!apiKey && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    尚未配置 DeepSeek API Key。先到「设置」页填入。
                  </p>
                )}
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap'
                      : 'mr-auto max-w-[95%] rounded-lg bg-secondary px-3 py-2 text-sm'
                  }
                >
                  {m.role === 'assistant' ? (
                    m.content ? (
                      <Markdown content={m.content} />
                    ) : (
                      <span className="text-muted-foreground">…</span>
                    )
                  ) : (
                    m.content
                  )}
                </div>
              ))
            )}
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={2}
                placeholder="问点什么，比如「BTC 现在多少仓位？」"
                className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={streaming}
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-secondary"
                  title="停止"
                >
                  <StopCircle className="h-4 w-4" />
                  停止
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  发送
                </button>
              )}
            </form>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Enter 发送 · Shift+Enter 换行 · 仅供参考，非投资建议
            </p>
          </div>
        </div>
      )}
    </>
  );
}
