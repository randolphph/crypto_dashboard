'use client';

import { useEffect, useState } from 'react';
import { Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { useVaultStore } from '@/stores/vaultStore';

interface HealthResponse {
  ok: boolean;
  snapshotCount?: number;
  lastTs?: number;
  dbSizeBytes?: number;
}

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

const RANGES: { label: string; days: number | null }[] = [
  { label: '全部', days: null },
  { label: '最近 30 天', days: 30 },
  { label: '最近 90 天', days: 90 },
  { label: '最近 1 年', days: 365 },
];

export function SnapshotExport() {
  const walletAddress = useVaultStore((s) => s.address);
  const wallet = walletAddress?.toLowerCase() ?? null;
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number | null>(null);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    const qs = new URLSearchParams({ wallet }).toString();
    fetch(`/api/snapshot/health?${qs}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: HealthResponse) => {
        if (!cancelled) setHealth(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const exportUrl = (file: string) => {
    if (!wallet) return '#';
    const params = new URLSearchParams({ wallet });
    if (rangeDays !== null) {
      const from = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
      params.set('from', String(from));
    }
    return `/api/snapshot/export/${file}?${params.toString()}`;
  };

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <div>
        <h2 className="font-semibold text-lg">快照导出</h2>
        <p className="text-sm text-muted-foreground mt-1">
          每次刷新会自动推送一份归一化的持仓快照到后端（≥4 小时去重）。
          导出 CSV 可直接粘贴给 LLM 做投资分析。
        </p>
      </div>

      <div className="text-xs text-muted-foreground tabular-nums">
        {!wallet ? (
          <span className="text-amber-600 dark:text-amber-400">
            未解锁钱包，无法识别身份。请先在主页用钱包登录。
          </span>
        ) : error ? (
          <span className="text-red-600 dark:text-red-400">
            后端连接失败：{error}
          </span>
        ) : !health ? (
          '加载后端状态…'
        ) : (
          <span>
            当前钱包{' '}
            <code className="font-mono">
              {wallet.slice(0, 6)}…{wallet.slice(-4)}
            </code>{' '}
            已收录{' '}
            <strong>{health.snapshotCount?.toLocaleString() ?? 0}</strong> 条快照
            {health.lastTs && (
              <>
                {' · 最近一次 '}
                <span title={new Date(health.lastTs).toLocaleString()}>
                  {formatAge(health.lastTs)}
                </span>
              </>
            )}
            {health.dbSizeBytes !== undefined &&
              ` · DB 共 ${formatBytes(health.dbSizeBytes)}`}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">时间范围：</span>
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setRangeDays(r.days)}
            className={`px-2.5 py-1 rounded-md border transition-colors ${
              rangeDays === r.days
                ? 'bg-primary text-primary-foreground border-primary'
                : 'hover:bg-secondary'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <ExportButton
          href={exportUrl('positions.csv')}
          disabled={!wallet}
          icon={<FileSpreadsheet className="h-4 w-4" />}
          label="持仓明细 CSV"
          sub="每行一条 position × ts"
        />
        <ExportButton
          href={exportUrl('portfolio.csv')}
          disabled={!wallet}
          icon={<FileSpreadsheet className="h-4 w-4" />}
          label="组合汇总 CSV"
          sub="每行一个 ts 的总值"
        />
        <ExportButton
          href={exportUrl('full.json')}
          disabled={!wallet}
          icon={<FileJson className="h-4 w-4" />}
          label="完整 JSON"
          sub="一次性灌给 LLM"
        />
      </div>
    </section>
  );
}

function ExportButton({
  href,
  disabled,
  icon,
  label,
  sub,
}: {
  href: string;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <a
      href={disabled ? undefined : href}
      download
      aria-disabled={disabled}
      onClick={disabled ? (e) => e.preventDefault() : undefined}
      className={`flex items-start gap-2 rounded-lg border bg-background p-3 transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:border-foreground/20 hover:bg-secondary'
      }`}
    >
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {label}
          <Download className="h-3 w-3 text-muted-foreground" />
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
      </div>
    </a>
  );
}
