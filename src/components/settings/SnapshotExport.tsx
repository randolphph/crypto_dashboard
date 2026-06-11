'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Download, FileText, Trash2, Upload } from 'lucide-react';
import { useVaultStore } from '@/stores/vaultStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import {
  appendSnapshot,
  clearWallet,
  getSnapshots,
  getStats,
  importSnapshots,
  type SnapshotStats,
} from '@/lib/snapshot/store';
import {
  downloadText,
  parseSnapshotsJson,
  readFileText,
  snapshotToAiJson,
  snapshotToMarkdown,
} from '@/lib/snapshot/export';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatAge(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec} 秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

export function SnapshotExport() {
  const walletAddress = useVaultStore((s) => s.address);
  const wallet = walletAddress?.toLowerCase() ?? null;
  const latestPayload = useDashboardStore((s) => s.latestSnapshotPayload);
  const [stats, setStats] = useState<SnapshotStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    setError(null);
    getStats(wallet)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, refreshKey]);

  const doExport = async (format: 'json' | 'md') => {
    if (!wallet) return;
    try {
      const all = await getSnapshots(wallet);
      if (all.length === 0) {
        setError('IndexedDB 里还没有快照。先点「立即快照」生成一条。');
        return;
      }
      const latest = all[all.length - 1];
      const stamp = new Date(latest.timestamp)
        .toISOString()
        .replace(/[:.]/g, '-');
      if (format === 'json') {
        downloadText(
          JSON.stringify(snapshotToAiJson(latest), null, 2),
          `snapshot-${stamp}.json`,
          'application/json'
        );
      } else {
        downloadText(
          snapshotToMarkdown(latest),
          `snapshot-${stamp}.md`,
          'text/markdown'
        );
      }
      setError(null);
      setInfo(`已导出 ${format === 'json' ? 'JSON' : 'Markdown'}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setInfo(null);
    setError(null);
    try {
      const text = await readFileText(file);
      const snapshots = parseSnapshotsJson(text);
      if (snapshots.length === 0) {
        setError(
          'JSON 不含可识别的原始快照。注意：导入需要 IndexedDB 完整快照（含 positions / portfolio），不是 AI 导出的精简版。'
        );
        return;
      }
      const { inserted, skipped } = await importSnapshots(snapshots);
      setInfo(`导入 ${inserted} 条，跳过 ${skipped} 条已存在`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClear = async () => {
    if (!wallet) return;
    if (
      !window.confirm(
        '清空当前钱包的全部本地快照？\n该操作不可撤销（除非你之前导出过 JSON）。'
      )
    )
      return;
    try {
      const n = await clearWallet(wallet);
      setInfo(`已删除 ${n} 条`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleManualSnapshot = async () => {
    if (!latestPayload) {
      setError(
        '暂无可用快照数据。请先打开资产看板让数据加载完整后再回来手动快照。'
      );
      return;
    }
    setManualBusy(true);
    setError(null);
    setInfo(null);
    try {
      await appendSnapshot({ ...latestPayload, timestamp: Date.now() });
      setInfo('已手动写入一条快照');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">快照导出</h2>
          <p className="text-sm text-muted-foreground mt-1">
            快照存在浏览器 IndexedDB（按钱包地址分区）。每 12 小时自动追加一份（去重），也可手动立即快照。
            导出的是为 AI 分析裁剪过的精简 JSON：股票多空、看涨/看跌期权、加密合约多空、非稳定币现货。现金、稳定币、链上 DeFi 不导出。
          </p>
        </div>
        <button
          onClick={handleManualSnapshot}
          disabled={!wallet || !latestPayload || manualBusy}
          title={
            !latestPayload
              ? '请先打开资产看板加载完数据'
              : '立即写入一条快照（不受 12h 节流限制）'
          }
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="h-4 w-4" />
          {manualBusy ? '快照中…' : '立即快照'}
        </button>
      </div>

      <div className="text-xs text-muted-foreground tabular-nums space-y-1">
        {!wallet ? (
          <span className="text-amber-600 dark:text-amber-400">
            未解锁钱包，无法识别身份。请先在主页用钱包登录。
          </span>
        ) : error ? (
          <span className="text-red-600 dark:text-red-400">错误：{error}</span>
        ) : !stats ? (
          '加载本地快照状态…'
        ) : (
          <>
            <div>
              当前钱包{' '}
              <code className="font-mono">
                {wallet.slice(0, 6)}…{wallet.slice(-4)}
              </code>{' '}
              已收录 <strong>{stats.count.toLocaleString()}</strong> 条快照
              {stats.lastTs && (
                <>
                  {' · 最近一次 '}
                  <span title={new Date(stats.lastTs).toLocaleString()}>
                    {formatAge(stats.lastTs)}
                  </span>
                </>
              )}
            </div>
            {stats.storageUsageBytes != null && (
              <div>
                浏览器存储 {formatBytes(stats.storageUsageBytes)}
                {stats.storageQuotaBytes != null && (
                  <>
                    {' / '}
                    {formatBytes(stats.storageQuotaBytes)}
                    {' 配额'}
                  </>
                )}
              </div>
            )}
            {info && (
              <div className="text-emerald-600 dark:text-emerald-400">
                {info}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => doExport('json')}
          disabled={!wallet || stats?.count === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          导出 JSON
        </button>
        <button
          onClick={() => doExport('md')}
          disabled={!wallet || stats?.count === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileText className="h-4 w-4" />
          导出 Markdown 报告
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!wallet || importing}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {importing ? '导入中…' : '从 JSON 导入'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
          }}
        />
        <button
          onClick={handleClear}
          disabled={!wallet || stats?.count === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-500/30 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          清空当前钱包快照
        </button>
      </div>
    </section>
  );
}
