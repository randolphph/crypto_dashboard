'use client';

import type { SnapshotPayload } from '@/types/snapshot';
import type { PortfolioSnapshot } from '@/stores/portfolioHistoryStore';
import { getSnapshots } from '@/lib/snapshot/store';
import {
  snapshotToAiJson,
  snapshotToMarkdown,
} from '@/lib/snapshot/export';

export interface ChatContextOptions {
  wallet: string | null;
  latest: SnapshotPayload | null;
  history: PortfolioSnapshot[];
  // Cap on historical IndexedDB snapshots included. Each is summarised
  // (totalUsd + category buckets + per-underlying net) — not the full
  // markdown — so 30-ish is comfortable inside DeepSeek's 64K window.
  maxHistoricalSnapshots?: number;
}

const DEFAULT_HISTORICAL = 30;

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3)
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// Compact the net-value curve to one row per local day (closest to noon).
// 30d window — the chat is mainly about "what happened recently". Older points
// stay in the IndexedDB snapshot summaries below.
function compactHistory(history: PortfolioSnapshot[]): PortfolioSnapshot[] {
  if (history.length === 0) return history;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const byDay = new Map<string, PortfolioSnapshot>();
  for (const s of history) {
    if (s.timestamp < cutoff) continue;
    const d = new Date(s.timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const noon = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      12
    ).getTime();
    const existing = byDay.get(key);
    if (
      !existing ||
      Math.abs(s.timestamp - noon) < Math.abs(existing.timestamp - noon)
    ) {
      byDay.set(key, s);
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Pick a representative subset of historical snapshots: every snapshot from
// the last 7 days, then thin to one-per-day, then one-per-week beyond 30d.
function pickHistoricalSnapshots(
  snaps: SnapshotPayload[],
  cap: number
): SnapshotPayload[] {
  if (snaps.length <= cap) return snaps;
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const month = 30 * 24 * 60 * 60 * 1000;

  const recent: SnapshotPayload[] = [];
  const dailyByKey = new Map<string, SnapshotPayload>();
  const weeklyByKey = new Map<string, SnapshotPayload>();

  for (const s of snaps) {
    const age = now - s.timestamp;
    if (age <= week) {
      recent.push(s);
    } else if (age <= month) {
      const d = new Date(s.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      dailyByKey.set(key, s);
    } else {
      const d = new Date(s.timestamp);
      const weekOfYear = Math.floor(
        (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / week
      );
      const key = `${d.getFullYear()}-W${weekOfYear}`;
      weeklyByKey.set(key, s);
    }
  }

  const merged = [
    ...weeklyByKey.values(),
    ...dailyByKey.values(),
    ...recent,
  ].sort((a, b) => a.timestamp - b.timestamp);
  // If still over the cap, drop oldest until we fit.
  return merged.slice(Math.max(0, merged.length - cap));
}

// One-line summary per historical snapshot — date, total, category buckets,
// top-3 underlyings by abs net exposure. Enough for trend questions without
// burning tokens on per-position detail.
function summariseHistorical(s: SnapshotPayload): string {
  const ai = snapshotToAiJson(s);
  const c = ai.summary.byCategory;
  const top = ai.summary.byUnderlying.slice(0, 3)
    .map((u) => `${u.underlying} ${fmtUsd(u.netUsd)}`)
    .join(', ');
  return [
    `- ${fmtDate(s.timestamp)}`,
    `total ${fmtUsd(ai.totalUsd)}`,
    `crypto ${fmtUsd(c.cryptoSpotUsd)}/+${fmtUsd(c.cryptoPerpsLongUsd)}/-${fmtUsd(c.cryptoPerpsShortUsd)}`,
    `stocks +${fmtUsd(c.stocksLongUsd)}/-${fmtUsd(c.stocksShortUsd)}`,
    `options ${fmtUsd(c.optionsValueUsd)}`,
    `deribit ${fmtUsd(c.deribitEquityUsd)}`,
    `cash ${fmtUsd(c.cashImpliedUsd)}`,
    top ? `top: ${top}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface BuiltContext {
  systemPrompt: string;
  // For UI display — what was actually injected.
  meta: {
    hasLatest: boolean;
    historyPoints: number;
    historicalSnapshots: number;
  };
}

export async function buildChatContext(
  options: ChatContextOptions
): Promise<BuiltContext> {
  const { wallet, latest, history } = options;
  const cap = options.maxHistoricalSnapshots ?? DEFAULT_HISTORICAL;

  const sections: string[] = [];

  sections.push(
    [
      '你是接入用户个人资产看板的 AI 助手。',
      '用户会用中文问你关于自己持仓、净值变化、风险敞口、配置建议的问题。',
      '回答规则：',
      '1. 严格基于下面提供的快照数据，不要编造账户、金额、币种。',
      '2. 涉及数字时给出具体值（USD），不要只说定性。',
      '3. 不构成投资建议；涉及操作建议时使用"情景"措辞，并说明风险。',
      '4. 简洁、克制、中文回答。表格用 markdown 表格。',
    ].join('\n')
  );

  if (wallet) {
    sections.push(`当前钱包：\`${wallet.slice(0, 6)}…${wallet.slice(-4)}\``);
  } else {
    sections.push('（未识别到钱包地址，数据可能不完整。）');
  }

  if (latest) {
    sections.push('## 当前快照（详细）');
    sections.push(snapshotToMarkdown(latest));
  } else {
    sections.push('## 当前快照\n（暂无最新快照——用户可能还没解锁或数据未加载完。）');
  }

  const compactedHistory = compactHistory(history);
  if (compactedHistory.length > 0) {
    sections.push('## 近 90 天净值曲线（每日一点）');
    const lines = compactedHistory.map(
      (s) => `- ${fmtDate(s.timestamp)}：${fmtUsd(s.value)}`
    );
    sections.push(lines.join('\n'));
  }

  let historicalCount = 0;
  if (wallet) {
    try {
      const all = await getSnapshots(wallet);
      const picked = pickHistoricalSnapshots(all, cap);
      historicalCount = picked.length;
      if (picked.length > 0) {
        sections.push(
          `## 历史快照摘要（共 ${all.length} 条，已抽样 ${picked.length} 条）`
        );
        sections.push(picked.map(summariseHistorical).join('\n'));
      }
    } catch {
      // IndexedDB unavailable — silently skip.
    }
  }

  return {
    systemPrompt: sections.join('\n\n'),
    meta: {
      hasLatest: !!latest,
      historyPoints: compactedHistory.length,
      historicalSnapshots: historicalCount,
    },
  };
}
