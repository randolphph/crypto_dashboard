'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  Landmark,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LEDGER_CSV_HEADER,
  LEDGER_EXPORT_CSV_HEADER,
  parseLedgerCsv,
} from '@/lib/ledger/csv';
import { cn } from '@/lib/utils';
import { useLedgerStore } from '@/stores/ledgerStore';
import { useDailyReviewStore } from '@/stores/dailyReviewStore';
import { useTradeStore } from '@/stores/tradeStore';
import { parseIbkrFlexXml } from '@/lib/ledger/ibkrSync';
import { DailyTradeTimeline } from '@/components/ledger/DailyTradeTimeline';
import type {
  LedgerAccount,
  LedgerActivity,
  LedgerActivityKind,
  LedgerInstrumentType,
  LedgerPlatform,
  LedgerSide,
  LedgerSyncMode,
  LedgerOperation,
} from '@/types/ledger';
import {
  LEDGER_INSTRUMENT_LABEL,
  LEDGER_OPERATION_LABEL,
  LEDGER_PLATFORM_LABEL,
} from '@/types/ledger';
import {
  TRADING_EMOTION_LABEL,
  type TradingEmotion,
} from '@/types/review';

const CURRENCIES = ['CNY', 'USD', 'HKD', 'KRW', 'USDT', 'USDC'] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function datetimeLocalValue(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateValue(timestamp = Date.now()): string {
  return datetimeLocalValue(timestamp).slice(0, 10);
}

function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

function formatNumber(value: number, digits = 4): string {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: digits,
  }).format(value);
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function accountSubtitle(account: LedgerAccount): string {
  if (account.syncMode === 'api') return 'API 延迟确认';
  if (account.syncMode === 'csv') return '交割单导入';
  return '手工维护';
}

function statusLabel(activity: LedgerActivity): string {
  if (activity.status === 'provisional') return '待确认';
  if (activity.status === 'unmatched') return '未匹配';
  if (activity.status === 'cancelled') return '已撤销';
  if (activity.status === 'corrected') return '已更正';
  return activity.source === 'api' ? 'API 已确认' : '已记录';
}

function activityActionLabel(activity: LedgerActivity): string {
  if (activity.kind === 'delivery') return '到期交割';
  if (activity.operation === 'open') return activity.side === 'buy' ? '买入开仓' : '卖出开仓';
  if (activity.operation === 'close') return activity.side === 'buy' ? '买入平仓' : '卖出平仓';
  if (activity.operation === 'add') return activity.side === 'buy' ? '买入加仓' : '卖出加仓';
  if (activity.operation === 'reduce') return activity.side === 'buy' ? '买入减仓' : '卖出减仓';
  if (activity.operation === 'reverse') return activity.side === 'buy' ? '买入反向开仓' : '卖出反向开仓';
  if (activity.instrumentType === 'crypto_spot') return activity.side === 'buy' ? '现货买入' : '现货卖出';
  return activity.side === 'buy' ? '买入' : '卖出';
}

function StatusBadge({ activity }: { activity: LedgerActivity }) {
  const pending = activity.status === 'provisional' || activity.status === 'unmatched';
  return (
    <Badge
      variant="outline"
      className={cn(
        pending
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      )}
    >
      {pending ? <Clock3 /> : <CheckCircle2 />}
      {statusLabel(activity)}
    </Badge>
  );
}

interface TradeFormState {
  accountId: string;
  kind: LedgerActivityKind;
  operation: LedgerOperation | 'trade';
  occurredAt: string;
  instrumentType: LedgerInstrumentType;
  market: string;
  symbol: string;
  name: string;
  underlying: string;
  expiry: string;
  strike: string;
  optionType: 'call' | 'put';
  side: LedgerSide;
  quantity: string;
  price: string;
  currency: string;
  multiplier: string;
  commission: string;
  tax: string;
  otherFee: string;
  note: string;
}

function newTradeForm(account: LedgerAccount): TradeFormState {
  const cryptoPlatform = ['binance', 'okx', 'deribit'].includes(account.platform);
  return {
    accountId: account.id,
    kind: 'trade',
    operation: 'trade',
    occurredAt: datetimeLocalValue(),
    instrumentType: cryptoPlatform ? 'crypto_spot' : 'stock',
    market: cryptoPlatform ? 'CRYPTO' : account.platform === 'ths' ? 'A' : 'US',
    symbol: '',
    name: '',
    underlying: '',
    expiry: '',
    strike: '',
    optionType: 'call',
    side: 'buy',
    quantity: '',
    price: '',
    currency: account.baseCurrency,
    multiplier: '1',
    commission: '',
    tax: '',
    otherFee: '',
    note: '',
  };
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('grid gap-1.5 text-sm', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function LedgerPage() {
  const accounts = useLedgerStore((state) => state.accounts);
  const activities = useLedgerStore((state) => state.activities);
  const importBatches = useLedgerStore((state) => state.importBatches);
  const addActivity = useLedgerStore((state) => state.addActivity);
  const addAccount = useLedgerStore((state) => state.addAccount);
  const importActivities = useLedgerStore((state) => state.importActivities);
  const removeActivity = useLedgerStore((state) => state.removeActivity);
  const removeImportBatch = useLedgerStore((state) => state.removeImportBatch);
  const legacyTrades = useTradeStore((state) => state.trades);
  const reviews = useDailyReviewStore((state) => state.reviews);
  const upsertReview = useDailyReviewStore((state) => state.upsertReview);

  const [recordOpen, setRecordOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [accountFilter, setAccountFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<TradeFormState>(() => newTradeForm(accounts[0]));
  const [importPreview, setImportPreview] = useState<{
    fileName: string;
    activities: LedgerActivity[];
    errors: string[];
  } | null>(null);
  const [importAccountId, setImportAccountId] = useState(accounts[0].id);
  const [newAccount, setNewAccount] = useState<{
    name: string;
    platform: LedgerPlatform;
    baseCurrency: string;
    syncMode: LedgerSyncMode;
  }>({ name: '', platform: 'manual', baseCurrency: 'CNY', syncMode: 'manual' });
  const [reviewForm, setReviewForm] = useState<{
    date: string;
    emotion: TradingEmotion;
    intensity: number;
    logic: string;
    emotionNote: string;
    reflection: string;
  }>({
    date: localDateValue(),
    emotion: 'calm',
    intensity: 3,
    logic: '',
    emotionNote: '',
    reflection: '',
  });

  const pendingCount = activities.filter(
    (activity) => activity.status === 'provisional' || activity.status === 'unmatched'
  ).length;
  const confirmedCount = activities.filter((activity) => activity.status === 'confirmed').length;
  const hasMigratedLegacy = activities.some((activity) => activity.externalId?.startsWith('legacy:'));

  const filteredActivities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activities.filter((activity) => {
      if (accountFilter !== 'all' && activity.accountId !== accountFilter) return false;
      if (statusFilter === 'pending' && activity.status !== 'provisional' && activity.status !== 'unmatched') return false;
      if (statusFilter === 'confirmed' && activity.status !== 'confirmed') return false;
      if (!query) return true;
      const account = accounts.find((item) => item.id === activity.accountId);
      return [activity.symbol, activity.name, activity.note, account?.name]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [accountFilter, accounts, activities, search, statusFilter]);

  const selectedAccount = accounts.find((account) => account.id === form.accountId) ?? accounts[0];
  const quantityNumber = Number(form.quantity);
  const priceNumber = Number(form.price);
  const operationLabel = form.kind === 'opening_position'
    ? '期初仓位'
    : form.operation === 'trade'
      ? '普通交易'
      : LEDGER_OPERATION_LABEL[form.operation];

  const handleAccountChange = (accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;
    setForm((current) => ({
      ...current,
      accountId,
      currency: account.baseCurrency,
      instrumentType: ['binance', 'okx', 'deribit'].includes(account.platform)
        ? 'crypto_spot'
        : current.instrumentType === 'crypto_spot' || current.instrumentType === 'crypto_perp'
          ? 'stock'
          : current.instrumentType,
      market: ['binance', 'okx', 'deribit'].includes(account.platform)
        ? 'CRYPTO'
        : account.platform === 'ths'
          ? 'A'
          : 'US',
    }));
  };

  const handleRecord = (event: React.FormEvent) => {
    event.preventDefault();
    const occurredAt = new Date(form.occurredAt).getTime();
    const multiplier = Number(form.multiplier);
    const commission = Number(form.commission || 0);
    const tax = Number(form.tax || 0);
    const otherFee = Number(form.otherFee || 0);
    const strike = form.strike ? Number(form.strike) : undefined;
    if (
      !form.symbol.trim() ||
      !Number.isFinite(occurredAt) ||
      !(quantityNumber > 0) ||
      !(priceNumber >= 0) ||
      !(multiplier > 0) ||
      (strike !== undefined && !(strike > 0)) ||
      ![commission, tax, otherFee].every((value) => Number.isFinite(value) && value >= 0)
    ) {
      setMessage('请检查代码、时间、数量、价格和费用。');
      return;
    }
    const provisional = selectedAccount.syncMode === 'api';
    addActivity({
      accountId: form.accountId,
      kind: form.kind,
      occurredAt,
      confirmedAt: provisional ? undefined : Date.now(),
      instrumentType: form.instrumentType,
      market: form.market.trim().toUpperCase(),
      symbol: form.symbol.trim().toUpperCase(),
      name: form.name.trim() || undefined,
      underlying: form.underlying.trim().toUpperCase() || undefined,
      expiry: form.expiry || undefined,
      strike,
      optionType: form.instrumentType === 'option' ? form.optionType : undefined,
      side: form.side,
      quantity: quantityNumber,
      price: priceNumber,
      currency: form.currency,
      multiplier,
      commission,
      tax,
      otherFee,
      status: provisional ? 'provisional' : 'confirmed',
      source: 'manual',
      note: form.note.trim() || undefined,
      operation: form.kind === 'opening_position' ? 'opening' : form.operation,
    });
    setRecordOpen(false);
    const recordedName = selectedAccount.platform === 'ths' && form.name.trim()
      ? form.name.trim()
      : form.symbol.trim().toUpperCase();
    setMessage(`${recordedName} ${operationLabel}已记录${provisional ? `，等待 ${selectedAccount.name} 确认` : ''}。`);
    setForm(newTradeForm(selectedAccount));
  };

  const handleCsvFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.xml')) {
      const account = accounts.find((candidate) => candidate.id === importAccountId);
      if (account?.platform !== 'ibkr') {
        setMessage('IBKR Flex XML 请在上方选择 IBKR 账户。');
        return;
      }
      try {
        const activities = await parseIbkrFlexXml(await file.text(), account.id);
        setImportPreview({ fileName: file.name, activities, errors: [] });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'IBKR Flex XML 解析失败。');
      }
      return;
    }
    const result = parseLedgerCsv(await file.text(), accounts, importAccountId, activities);
    setImportPreview({ fileName: file.name, ...result });
  };

  const confirmImport = () => {
    if (!importPreview) return;
    const result = importActivities(importPreview.activities, {
      fileName: importPreview.fileName,
      errorCount: importPreview.errors.length,
    });
    setMessage(`已导入 ${result.inserted} 笔，跳过 ${result.skipped} 笔重复记录。`);
    setImportPreview(null);
    setImportOpen(false);
  };

  const downloadTemplate = () => {
    const example = [
      LEDGER_CSV_HEADER,
      '20260428,10:58:17,636,风华高科,sell,100,24.14,CNY,5',
      '20260511,13:00:08,600551,时代出版,buy,1000,7.97,CNY,5',
    ].join('\n');
    downloadText('ledger-import-template.csv', `\uFEFF${example}`);
  };

  const exportLedger = () => {
    const rows = activities.map((activity) => {
      const account = accounts.find((item) => item.id === activity.accountId);
      return [
        account?.name ?? activity.accountId,
        new Date(activity.occurredAt).toISOString(),
        activity.market,
        activity.symbol,
        activity.name,
        activity.instrumentType,
        activity.operation,
        activity.underlying,
        activity.expiry,
        activity.strike,
        activity.optionType,
        activity.side,
        activity.quantity,
        activity.price,
        activity.currency,
        activity.commission,
        activity.tax,
        activity.otherFee,
        activity.feeRate,
        activity.positionAfter,
        activity.markPrice,
        activity.indexPrice,
        activity.settlementPrice,
        activity.cashFlow,
        activity.externalId,
        activity.note,
      ].map(csvCell).join(',');
    });
    downloadText(
      `ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      `\uFEFF${[LEDGER_EXPORT_CSV_HEADER, ...rows].join('\n')}`
    );
  };

  const handleAddAccount = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newAccount.name.trim()) return;
    addAccount({
      ...newAccount,
      name: newAccount.name.trim(),
      enabled: true,
    });
    setNewAccount({ name: '', platform: 'manual', baseCurrency: 'CNY', syncMode: 'manual' });
    setAccountOpen(false);
    setMessage('账户已添加。');
  };

  const handleRemoveActivity = (activity: LedgerActivity) => {
    const account = accounts.find((item) => item.id === activity.accountId);
    const displayName = account?.platform === 'ths' && activity.name ? activity.name : activity.symbol;
    if (!window.confirm(`确定删除 ${displayName} 的这笔交易记录吗？此操作无法撤销。`)) return;
    removeActivity(activity.id);
    setMessage(`${displayName} 的交易记录已删除。`);
  };

  const handleRemoveBatch = (batchId: string, fileName: string) => {
    if (!window.confirm(`确定撤销“${fileName}”的整批导入吗？该批次产生的交易都会删除。`)) return;
    const removed = removeImportBatch(batchId);
    setMessage(`已撤销“${fileName}”，删除 ${removed} 笔导入交易。`);
  };

  const openReview = (date = localDateValue()) => {
    const existing = reviews.find((review) => review.date === date);
    setReviewForm(existing
      ? {
          date: existing.date,
          emotion: existing.emotion,
          intensity: existing.intensity,
          logic: existing.logic,
          emotionNote: existing.emotionNote,
          reflection: existing.reflection,
        }
      : {
          date,
          emotion: 'calm',
          intensity: 3,
          logic: '',
          emotionNote: '',
          reflection: '',
        });
    setReviewOpen(true);
  };

  const handleSaveReview = (event: React.FormEvent) => {
    event.preventDefault();
    upsertReview(reviewForm);
    setReviewOpen(false);
    setMessage(`${reviewForm.date} 的交易复盘已保存。`);
  };

  const migrateLegacyTrades = () => {
    const ibkrAccount = accounts.find((account) => account.platform === 'ibkr') ?? accounts[0];
    const aShareAccount = accounts.find((account) => account.platform === 'ths') ?? accounts[0];
    const migrated: LedgerActivity[] = legacyTrades
      .filter((trade) => trade.kind !== 'crypto')
      .map((trade) => {
        const isAShare = trade.currency.toUpperCase() === 'CNY' || trade.source === '同花顺';
        const account = isAShare ? aShareAccount : ibkrAccount;
        return {
          id: `legacy-${trade.id}`,
          accountId: account.id,
          kind: 'trade',
          occurredAt: trade.timestamp,
          recordedAt: Date.now(),
          confirmedAt: Date.now(),
          instrumentType: trade.kind === 'option' ? 'option' : 'stock',
          market: isAShare ? 'A' : 'US',
          symbol: trade.symbol,
          side: trade.direction,
          quantity: trade.quantity,
          price: trade.price,
          currency: trade.currency,
          multiplier: trade.kind === 'option' ? 100 : 1,
          commission: trade.fee ?? 0,
          tax: 0,
          otherFee: 0,
          status: 'confirmed',
          source: 'manual',
          externalId: `legacy:${trade.id}`,
          note: trade.note,
          operation: 'trade',
        } satisfies LedgerActivity;
      });
    const result = importActivities(migrated, {
      fileName: '旧版交易记录迁移',
      errorCount: legacyTrades.length - migrated.length,
    });
    setMessage(`已迁移 ${result.inserted} 笔旧版股票/期权记录；加密记录暂时保留在原时间线。`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Landmark className="size-4" />
            多账户 · 延迟确认账本
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">交易账本</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            统一记录 IBKR、Binance、OKX、Deribit、长桥和 A 股交易；API 延迟到达时保留待确认状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openReview()}>
            <Brain />记录情绪
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload />导入历史成交
          </Button>
          <Button onClick={() => setRecordOpen(true)}>
            <Plus />记录操作
          </Button>
        </div>
      </div>

      {message && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          <span className="flex items-center gap-2"><CheckCircle2 className="size-4" />{message}</span>
          <button className="text-xs opacity-70 hover:opacity-100" onClick={() => setMessage('')}>关闭</button>
        </div>
      )}

      {legacyTrades.length > 0 && !hasMigratedLegacy && (
        <div className="flex flex-col justify-between gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-sm sm:flex-row sm:items-center">
          <div>
            <p className="font-medium">发现 {legacyTrades.length} 笔旧版交易记录</p>
            <p className="text-xs text-muted-foreground">可将股票和期权记录复制进新账本；原记录不会被删除。</p>
          </div>
          <Button size="sm" variant="outline" onClick={migrateLegacyTrades}>迁移旧记录</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y py-2 text-xs text-muted-foreground">
        <span><strong className="mr-1 font-medium text-foreground">{formatNumber(activities.length, 0)}</strong>笔流水</span>
        <span><strong className="mr-1 font-medium text-foreground">{formatNumber(confirmedCount, 0)}</strong>已确认</span>
        <span className={pendingCount > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
          <strong className="mr-1 font-medium">{formatNumber(pendingCount, 0)}</strong>待确认
        </span>
        <span><strong className="mr-1 font-medium text-foreground">{formatNumber(importBatches.length, 0)}</strong>次导入</span>
        <span>{accounts.length} 个账户</span>
      </div>

      <Tabs defaultValue="timeline">
        <div className="flex flex-col justify-between gap-3 border-b sm:flex-row sm:items-center">
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="timeline">时间轴</TabsTrigger>
            <TabsTrigger value="activities">流水</TabsTrigger>
            <TabsTrigger value="imports">导入记录</TabsTrigger>
            <TabsTrigger value="accounts">数据源</TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" onClick={exportLedger} disabled={!activities.length}>
            <Download />导出账本
          </Button>
        </div>

        <TabsContent value="timeline" className="pt-2">
          <DailyTradeTimeline
            activities={activities}
            accounts={accounts}
            reviews={reviews}
            onEditReview={openReview}
          />
        </TabsContent>

        <TabsContent value="activities" className="space-y-3 pt-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索代码、名称或备注"
                className="pl-8"
              />
            </div>
            <select
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
              className="h-8 rounded-lg border bg-background px-2.5 text-sm"
            >
              <option value="all">全部账户</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-8 rounded-lg border bg-background px-2.5 text-sm"
            >
              <option value="all">全部状态</option>
              <option value="confirmed">已确认</option>
              <option value="pending">待确认</option>
            </select>
          </div>

          <Card>
            <CardContent className="px-0">
              {filteredActivities.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-16 text-center">
                  <div className="mb-3 rounded-xl bg-muted p-3"><FileSpreadsheet className="size-5 text-muted-foreground" /></div>
                  <p className="font-medium">还没有交易流水</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    记录一笔操作，或导入任一平台的历史成交。建仓、加仓、减仓和清仓作为交易标签保存。
                  </p>
                  <Button className="mt-4" onClick={() => setRecordOpen(true)}><Plus />记录第一笔</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">时间 / 账户</TableHead>
                      <TableHead>标的</TableHead>
                      <TableHead>操作</TableHead>
                      <TableHead className="text-right">成交</TableHead>
                      <TableHead className="text-right">费用</TableHead>
                      <TableHead className="pr-4 text-right">状态</TableHead>
                      <TableHead className="pr-4 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActivities.map((activity) => {
                      const account = accounts.find((item) => item.id === activity.accountId);
                      const displayName = account?.platform === 'ths' && activity.name
                        ? activity.name
                        : activity.symbol;
                      const fee = activity.commission + activity.tax + activity.otherFee;
                      return (
                        <TableRow key={activity.id}>
                          <TableCell className="pl-4">
                            <div className="font-medium tabular-nums">{formatDateTime(activity.occurredAt)}</div>
                            <div className="text-xs text-muted-foreground">{account?.name ?? '未知账户'}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold">{displayName}</div>
                            <div className="text-xs text-muted-foreground">
                              {account?.platform === 'ths'
                                ? `${activity.market} · ${LEDGER_INSTRUMENT_LABEL[activity.instrumentType]}`
                                : activity.name ?? `${activity.market} · ${LEDGER_INSTRUMENT_LABEL[activity.instrumentType]}`}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={cn('flex items-center gap-1.5 font-medium', activity.side === 'buy' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                              {activity.side === 'buy' ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                              {activityActionLabel(activity)}
                            </div>
                            <div className="text-xs text-muted-foreground">{LEDGER_INSTRUMENT_LABEL[activity.instrumentType]}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <div>{activity.currency} {formatNumber(Math.abs(activity.quantity * activity.price * activity.multiplier), 8)}</div>
                            {activity.indexPrice !== undefined && <div className="text-xs text-muted-foreground">指数 {formatNumber(activity.indexPrice, 2)} USD</div>}
                            {activity.kind === 'delivery' && activity.settlementPrice !== undefined && <div className="text-xs text-muted-foreground">结算 {formatNumber(activity.settlementPrice, 2)} USD</div>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fee ? <><div>{activity.currency} {formatNumber(fee, 8)}</div>{activity.feeRate !== undefined && <div className="text-xs">费率 {formatNumber(activity.feeRate, 8)}</div>}</> : '—'}
                          </TableCell>
                          <TableCell className="pr-4 text-right"><StatusBadge activity={activity} /></TableCell>
                          <TableCell className="pr-4 text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`删除 ${displayName} 交易`}
                              onClick={() => handleRemoveActivity(activity)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="imports" className="pt-2">
          <Card>
            <CardHeader><CardTitle>历史导入记录</CardTitle><CardDescription>每次导入单独留痕，重复成交会被跳过。</CardDescription></CardHeader>
            <CardContent className="px-0">
              {importBatches.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground">尚未导入历史成交。</div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="pl-4">文件</TableHead><TableHead>导入时间</TableHead><TableHead className="text-right">新增</TableHead><TableHead className="text-right">跳过</TableHead><TableHead className="text-right">错误</TableHead><TableHead className="pr-4 text-right">操作</TableHead></TableRow></TableHeader>
                  <TableBody>{importBatches.map((batch) => <TableRow key={batch.id}><TableCell className="pl-4 font-medium">{batch.fileName}</TableCell><TableCell>{formatDateTime(batch.importedAt)}</TableCell><TableCell className="text-right">{batch.inserted}</TableCell><TableCell className="text-right">{batch.skipped}</TableCell><TableCell className="text-right">{batch.errorCount}</TableCell><TableCell className="pr-4 text-right"><Button variant="ghost" size="sm" onClick={() => handleRemoveBatch(batch.id, batch.fileName)} className="text-muted-foreground hover:text-destructive"><Trash2 />撤销整批</Button></TableCell></TableRow>)}</TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-3 pt-2">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <Card key={account.id} size="sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted p-2"><Landmark className="size-4" /></div>
                      <div><CardTitle>{account.name}</CardTitle><CardDescription>{LEDGER_PLATFORM_LABEL[account.platform]}</CardDescription></div>
                    </div>
                    <Badge variant="outline">{account.baseCurrency}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{accountSubtitle(account)}</span>
                  <span>{activities.filter((activity) => activity.accountId === account.id).length} 笔流水</span>
                </CardContent>
              </Card>
            ))}
            <button onClick={() => setAccountOpen(true)} className="flex min-h-28 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 hover:text-foreground">
              <Plus className="size-4" />添加投资账户
            </button>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        当前为账本基础版，交易与每日复盘暂存在本机浏览器。服务端账本接入前请定期导出；本机记录不会直接改变资产看板持仓。
      </div>

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={handleRecord}>
            <DialogHeader>
              <DialogTitle>记录一笔操作</DialogTitle>
              <DialogDescription>API 平台的手工暂记会等待成交同步确认，纯手工账户直接记为已确认。</DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="账户">
                <select value={form.accountId} onChange={(event) => handleAccountChange(event.target.value)} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </Field>
              <Field label="记录类型">
                <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as LedgerActivityKind })} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                  <option value="trade">真实成交</option>
                  <option value="opening_position">期初仓位</option>
                </select>
              </Field>
              <Field label="交易标签">
                <select value={form.operation} onChange={(event) => setForm({ ...form, operation: event.target.value as LedgerOperation | 'trade' })} disabled={form.kind === 'opening_position'} className="h-8 rounded-lg border bg-background px-2.5 text-sm disabled:opacity-50">
                  <option value="trade">普通交易</option>
                  <option value="open">建仓</option>
                  <option value="add">加仓</option>
                  <option value="reduce">减仓</option>
                  <option value="close">清仓</option>
                  <option value="reverse">反向开仓</option>
                </select>
              </Field>
              <Field label="成交时间"><Input type="datetime-local" value={form.occurredAt} onChange={(event) => setForm({ ...form, occurredAt: event.target.value })} /></Field>
              <Field label="资产类型">
                <select value={form.instrumentType} onChange={(event) => {
                  const instrumentType = event.target.value as LedgerInstrumentType;
                  setForm({ ...form, instrumentType, multiplier: instrumentType === 'option' ? '100' : '1' });
                }} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                  <option value="stock">股票</option>
                  <option value="option">期权</option>
                  <option value="crypto_spot">加密现货</option>
                  <option value="crypto_perp">永续合约</option>
                  <option value="future">期货</option>
                </select>
              </Field>
              {form.instrumentType === 'option' && (
                <>
                  <Field label="标的资产"><Input value={form.underlying} onChange={(event) => setForm({ ...form, underlying: event.target.value })} placeholder="AAPL" /></Field>
                  <Field label="到期日"><Input type="date" value={form.expiry} onChange={(event) => setForm({ ...form, expiry: event.target.value })} /></Field>
                  <Field label="行权价"><Input type="number" min="0" step="any" value={form.strike} onChange={(event) => setForm({ ...form, strike: event.target.value })} /></Field>
                  <Field label="期权类型">
                    <select value={form.optionType} onChange={(event) => setForm({ ...form, optionType: event.target.value as 'call' | 'put' })} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                      <option value="call">Call / 认购</option><option value="put">Put / 认沽</option>
                    </select>
                  </Field>
                </>
              )}
              <Field label="市场"><Input value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value })} placeholder="A / US / HK" /></Field>
              <Field label="代码"><Input value={form.symbol} onChange={(event) => setForm({ ...form, symbol: event.target.value })} placeholder="600519 / AAPL" autoFocus /></Field>
              <Field label="名称（可选）"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="贵州茅台" /></Field>
              <Field label="方向">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setForm({ ...form, side: 'buy' })} className={cn('h-8 rounded-lg border text-sm font-medium', form.side === 'buy' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>买入</button>
                  <button type="button" onClick={() => setForm({ ...form, side: 'sell' })} className={cn('h-8 rounded-lg border text-sm font-medium', form.side === 'sell' ? 'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'text-muted-foreground')}>卖出</button>
                </div>
              </Field>
              <Field label="数量"><Input type="number" min="0" step="any" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field>
              <Field label="成交价 / 期初成本"><Input type="number" min="0" step="any" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
              <Field label="币种">
                <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                  {CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </Field>
              <Field label="合约乘数"><Input type="number" min="1" step="any" value={form.multiplier} onChange={(event) => setForm({ ...form, multiplier: event.target.value })} /></Field>
              <Field label="佣金"><Input type="number" min="0" step="any" value={form.commission} onChange={(event) => setForm({ ...form, commission: event.target.value })} placeholder="0" /></Field>
              <Field label="税费"><Input type="number" min="0" step="any" value={form.tax} onChange={(event) => setForm({ ...form, tax: event.target.value })} placeholder="0" /></Field>
              <Field label="其他费用"><Input type="number" min="0" step="any" value={form.otherFee} onChange={(event) => setForm({ ...form, otherFee: event.target.value })} placeholder="0" /></Field>
              <Field label="备注"><Input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="可选" /></Field>
            </div>
            <div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">记录标签</span><Badge variant="outline">{operationLabel}</Badge></div>
              <div className="mt-2 flex items-center justify-between"><span className="text-muted-foreground">成交金额</span><span className="font-medium tabular-nums">{form.currency} {formatNumber((Number.isFinite(quantityNumber) ? quantityNumber : 0) * (Number.isFinite(priceNumber) ? priceNumber : 0) * (Number(form.multiplier) || 1), 2)}</span></div>
              {selectedAccount.syncMode === 'api' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">这是 API 平台的手工暂记，后续成交同步会用平台成交 ID 匹配确认。</p>}
            </div>
            {message && recordOpen && <p className="mt-3 text-sm text-destructive">{message}</p>}
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRecordOpen(false)}>取消</Button>
              <Button type="submit">保存操作</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) setImportPreview(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>导入历史成交</DialogTitle>
            <DialogDescription>支持 CSV 和 IBKR Flex XML；导入前会先预览，并跳过重复成交。</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-dashed p-5 text-center">
            <FileSpreadsheet className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="text-sm font-medium">选择券商交割单、Flex XML 或统一模板</p>
            <p className="mt-1 text-xs text-muted-foreground">IBKR XML 自动识别股票、期权和期货；外汇成交会跳过</p>
            <select value={importAccountId} onChange={(event) => { setImportAccountId(event.target.value); setImportPreview(null); }} className="mx-auto mt-3 block h-8 max-w-sm rounded-lg border bg-background px-2.5 text-sm">
              {accounts.map((account) => <option key={account.id} value={account.id}>空账户列默认导入到：{account.name}</option>)}
            </select>
            <Input type="file" accept=".csv,text/csv,.xml,application/xml,text/xml" className="mx-auto mt-3 max-w-sm" onChange={(event) => handleCsvFile(event.target.files?.[0])} />
            <Button variant="link" size="sm" className="mt-2" onClick={downloadTemplate}><Download />下载统一模板</Button>
          </div>
          {importPreview && (
            <div className="rounded-lg bg-muted/60 p-3 text-sm">
              <div className="flex items-center justify-between"><span className="font-medium">{importPreview.fileName}</span><Badge variant="outline">{importPreview.activities.length} 笔可导入</Badge></div>
              {importPreview.errors.length > 0 && (
                <div className="mt-3 max-h-28 overflow-y-auto text-xs text-destructive">
                  {importPreview.errors.slice(0, 20).map((error) => <p key={error}>{error}</p>)}
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">CSV 导入记录视为历史已确认成交；后续 API 会通过成交 ID 或交易指纹避免重复。</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
            <Button onClick={confirmImport} disabled={!importPreview?.activities.length}>确认导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent>
          <form onSubmit={handleAddAccount}>
            <DialogHeader><DialogTitle>添加投资账户</DialogTitle><DialogDescription>同一平台的多个子账户应分别建立，避免同步和成本混淆。</DialogDescription></DialogHeader>
            <div className="mt-4 grid gap-3">
              <Field label="账户名称"><Input value={newAccount.name} onChange={(event) => setNewAccount({ ...newAccount, name: event.target.value })} placeholder="例如：IBKR 家庭账户" autoFocus /></Field>
              <Field label="平台">
                <select value={newAccount.platform} onChange={(event) => setNewAccount({ ...newAccount, platform: event.target.value as LedgerPlatform })} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                  {Object.entries(LEDGER_PLATFORM_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="基础币种">
                <select value={newAccount.baseCurrency} onChange={(event) => setNewAccount({ ...newAccount, baseCurrency: event.target.value })} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                  {CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
                </select>
              </Field>
              <Field label="维护方式">
                <select value={newAccount.syncMode} onChange={(event) => setNewAccount({ ...newAccount, syncMode: event.target.value as LedgerSyncMode })} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                  <option value="manual">手工维护</option><option value="csv">CSV 导入</option><option value="api">API 延迟同步</option>
                </select>
              </Field>
            </div>
            <DialogFooter className="mt-4"><Button type="button" variant="outline" onClick={() => setAccountOpen(false)}>取消</Button><Button type="submit">添加账户</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={handleSaveReview}>
            <DialogHeader>
              <DialogTitle>记录交易情绪与复盘</DialogTitle>
              <DialogDescription>记录当时的事实和感受即可，不需要急着解释因果。</DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4">
              <Field label="日期">
                <Input type="date" value={reviewForm.date} onChange={(event) => setReviewForm({ ...reviewForm, date: event.target.value })} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="主要情绪">
                  <select value={reviewForm.emotion} onChange={(event) => setReviewForm({ ...reviewForm, emotion: event.target.value as TradingEmotion })} className="h-8 rounded-lg border bg-background px-2.5 text-sm">
                    {Object.entries(TRADING_EMOTION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label={`情绪强度 ${reviewForm.intensity}/5`}>
                  <Input type="range" min="1" max="5" step="1" value={reviewForm.intensity} onChange={(event) => setReviewForm({ ...reviewForm, intensity: Number(event.target.value) })} className="px-0" />
                </Field>
              </div>
              <Field label="操作逻辑">
                <textarea value={reviewForm.logic} onChange={(event) => setReviewForm({ ...reviewForm, logic: event.target.value })} rows={3} placeholder="当时看到什么、预期什么、为什么决定操作？" className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
              </Field>
              <Field label="情绪与触发">
                <textarea value={reviewForm.emotionNote} onChange={(event) => setReviewForm({ ...reviewForm, emotionNote: event.target.value })} rows={3} placeholder="操作前后有什么情绪变化？由什么事件触发？" className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
              </Field>
              <Field label="收盘后复盘">
                <textarea value={reviewForm.reflection} onChange={(event) => setReviewForm({ ...reviewForm, reflection: event.target.value })} rows={3} placeholder="逻辑是否仍成立？如果重来一次会怎么做？" className="w-full rounded-lg border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
              </Field>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>取消</Button>
              <Button type="submit">保存复盘</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
