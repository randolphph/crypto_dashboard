'use client';

// DeepSeek is OpenAI-compatible. Browser-side streaming via fetch + SSE.
// The API key travels in an Authorization header from the browser — the user
// opted for direct-call (no Next API proxy) so the key is visible in DevTools
// network panel. That's an accepted tradeoff for a single-user local dashboard.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}

const DEFAULT_MODEL = 'deepseek-chat';

interface DeltaChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
}

export async function* streamDeepseek(
  opts: StreamOptions
): AsyncGenerator<string, void, void> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      messages: opts.messages,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `DeepSeek 调用失败 (${res.status})${text ? `：${text.slice(0, 200)}` : ''}`
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames separated by blank lines. Each frame: "data: {json}\n".
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk: DeltaChunk = JSON.parse(payload);
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // Malformed line — skip; the stream stays usable.
      }
    }
  }
}
