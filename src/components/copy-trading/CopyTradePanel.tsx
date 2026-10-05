'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Ban,
  Check,
  CheckCircle2,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { fetchHyperliquidSnapshot } from '@/lib/hyperliquid/client';
import { isNonNegativeDecimal, isPositiveDecimal } from '@/lib/hyperliquid/decimal';
import {
  buildCopyPreview,
  executeCopyPreview,
  prepareHyperliquidTrading,
  type CopyExecutionResult,
  type CopyPreview,
  type FollowerOrderMapping,
} from '@/lib/hyperliquid/trading';
import { useApiKeyStore } from '@/stores/apiKeyStore';
import { cn } from '@/lib/utils';
import type { HyperliquidMonitorEvent, HyperliquidSnapshot } from '@/types/hyperliquid';

function compactOid(value: string) {
  return value.length > 10 ? `#${value.slice(-8)}` : `#${value}`;
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function previewLabel(decision: CopyPreview['items'][number]['decision']) {
  if (decision === 'position') return '仓位';
  if (decision === 'place') return '新挂单';
  if (decision === 'cancel') return '撤单';
  return '跳过';
}

interface CopyTradePanelProps {
  snapshot: HyperliquidSnapshot | null;
  events: HyperliquidMonitorEvent[];
}

export function CopyTradePanel({ snapshot, events }: CopyTradePanelProps) {
  const accountAddress = useApiKeyStore((state) => state.hyperliquidAccountAddress);
  const apiWalletPrivateKey = useApiKeyStore((state) => state.hyperliquidApiWalletPrivateKey);
  const credentialNetwork = useApiKeyStore((state) => state.hyperliquidNetwork);
  const [ratio, setRatio] = useState('0.1');
  const [maxSlippagePercent, setMaxSlippagePercent] = useState('0.5');
  const [preview, setPreview] = useState<CopyPreview | null>(null);
  const [mappings, setMappings] = useState<Map<string, FollowerOrderMapping>>(new Map());
  const [handledEventIds, setHandledEventIds] = useState<Set<string>>(new Set());
  const [trackedPositionCoins, setTrackedPositionCoins] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, CopyExecutionResult>>(new Map());
  const [preparing, setPreparing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const pendingEvents = useMemo(() => events.filter((event) =>
    event.sourceOid &&
    !handledEventIds.has(event.id) &&
    (event.kind === 'order_appeared' || event.kind === 'order_changed' || event.kind === 'order_disappeared'),
  ), [events, handledEventIds]);
  const executableCount = preview?.items.filter((item) => item.decision !== 'skip').length ?? 0;
  const previewEventIds = new Set(preview?.items.flatMap((item) => item.sourceEventIds) ?? []);
  const newerEventCount = pendingEvents.filter((event) => !previewEventIds.has(event.id)).length;
  const credentialsReady = Boolean(accountAddress && apiWalletPrivateKey);

  async function createPreview() {
    if (!snapshot) return;
    if (!isPositiveDecimal(ratio)) {
      setError('跟单比例必须是大于 0 的普通十进制数');
      return;
    }
    if (!credentialsReady) {
      setError('请先在设置中配置 Hyperliquid 主账户和 API Wallet');
      return;
    }
    if (credentialNetwork !== snapshot.network) {
      setError(`API Wallet 配置为${credentialNetwork === 'mainnet' ? '主网' : '测试网'}，与当前监控网络不一致`);
      return;
    }
    if (!isNonNegativeDecimal(maxSlippagePercent)) {
      setError('最大滑点必须是 0 到 5 之间的普通十进制数');
      return;
    }
    setPreparing(true);
    setError(null);
    setResults(new Map());
    try {
      const [prepared, follower] = await Promise.all([
        prepareHyperliquidTrading(accountAddress, apiWalletPrivateKey, snapshot.network),
        fetchHyperliquidSnapshot(accountAddress, snapshot.network),
      ]);
      const next = buildCopyPreview({
        events,
        handledEventIds,
        currentOrders: snapshot.orders,
        leaderPositions: snapshot.positions,
        followerPositions: follower.positions,
        followerOrders: follower.orders,
        trackedPositionCoins,
        mappings,
        markets: prepared.markets,
        mids: prepared.mids,
        ratio,
        maxSlippagePercent,
        targetAddress: snapshot.address,
        network: snapshot.network,
        signerAddress: prepared.signerAddress,
      });
      if (next.items.length === 0) {
        setError('目标账户当前没有可复刻的仓位或挂单');
        return;
      }
      setPreview(next);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : '无法生成跟单预览');
    } finally {
      setPreparing(false);
    }
  }

  function markItemsHandled(items: CopyPreview['items']) {
    setHandledEventIds((current) => {
      const next = new Set(current);
      items.forEach((item) => item.sourceEventIds.forEach((id) => next.add(id)));
      return next;
    });
  }

  async function confirmExecution() {
    if (!preview || !confirmed) return;
    setExecuting(true);
    setError(null);
    try {
      const prepared = await prepareHyperliquidTrading(accountAddress, apiWalletPrivateKey, preview.network);
      if (prepared.signerAddress.toLowerCase() !== preview.signerAddress.toLowerCase()) {
        throw new Error('API Wallet 已变化，请重新生成预览');
      }
      const [latest, follower] = await Promise.all([
        fetchHyperliquidSnapshot(preview.targetAddress, preview.network),
        fetchHyperliquidSnapshot(accountAddress, preview.network),
      ]);
      for (const item of preview.items.filter((entry) => entry.decision === 'position')) {
        const leaderPosition = latest.positions.find((position) => position.coin === item.coin);
        const followerPosition = follower.positions.find((position) => position.coin === item.coin);
        if ((leaderPosition?.size ?? '0') !== item.sourceSize || (followerPosition?.size ?? '0') !== item.followerSize) {
          throw new Error(`${item.coin} 仓位已经变化，请重新生成预览`);
        }
      }
      for (const item of preview.items.filter((entry) => entry.decision === 'place')) {
        const current = latest.orders.find((order) => order.oid === item.sourceOid);
        if (!current || current.price !== item.price || current.remainingSize !== item.sourceSize || current.side !== item.side || current.reduceOnly !== item.reduceOnly) {
          throw new Error(`${item.coin} 目标挂单已经变化，请重新生成预览`);
        }
      }
      const nextResults = await executeCopyPreview(preview, apiWalletPrivateKey);
      setResults(new Map(nextResults.map((result) => [result.itemId, result])));
      setMappings((current) => {
        const next = new Map(current);
        for (const result of nextResults) {
          if (result.mapping) next.set(result.mapping.sourceOid, result.mapping);
          if (result.removeSourceOid) next.delete(result.removeSourceOid);
        }
        return next;
      });
      setTrackedPositionCoins((current) => {
        const next = new Set(current);
        for (const item of preview.items.filter((entry) => entry.decision === 'position')) {
          const result = nextResults.find((entry) => entry.itemId === item.id);
          if (result?.status !== 'success') continue;
          if (item.targetSize === '0') next.delete(item.coin);
          else next.add(item.coin);
        }
        return next;
      });
      const completedItems = preview.items.filter((item) => {
        const result = nextResults.find((entry) => entry.itemId === item.id);
        return result?.status === 'success' || result?.status === 'skipped';
      });
      markItemsHandled(completedItems);
      setConfirmOpen(false);
      setConfirmed(false);
    } catch (executionError) {
      setError(executionError instanceof Error ? executionError.message : '提交失败，请重新生成预览');
      setConfirmOpen(false);
      setConfirmed(false);
    } finally {
      setExecuting(false);
    }
  }

  function discardPreview() {
    if (!preview) return;
    markItemsHandled(preview.items);
    setPreview(null);
    setResults(new Map());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Hyperliquid 跟单</CardTitle>
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400">人工确认</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              按比例复刻目标账户当前仓位与挂单；仓位按双方差额调整，挂单结束时撤销对应跟单挂单。
            </p>
          </div>
          <Badge variant="secondary">{snapshot ? `${snapshot.positions.length} 仓位 · ${snapshot.orders.length} 挂单` : '等待监控数据'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[160px_160px_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <label htmlFor="copy-ratio" className="text-sm font-medium">跟单比例</label>
            <Input
              id="copy-ratio"
              inputMode="decimal"
              value={ratio}
              onChange={(event) => {
                setRatio(event.target.value.trim());
                setPreview(null);
                setResults(new Map());
              }}
              placeholder="例如 0.1"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="copy-slippage" className="text-sm font-medium">仓位最大滑点</label>
            <div className="relative">
              <Input
                id="copy-slippage"
                className="pr-8"
                inputMode="decimal"
                value={maxSlippagePercent}
                onChange={(event) => {
                  setMaxSlippagePercent(event.target.value.trim());
                  setPreview(null);
                  setResults(new Map());
                }}
                placeholder="0.5"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">目标仓位 = 目标账户仓位 × 跟单比例</p>
            <p className="mt-1">只交易与当前跟单仓位之间的差额；不会处理目标账户未持有的其他仓位。</p>
          </div>
          <Button onClick={() => void createPreview()} disabled={!snapshot || preparing}>
            {preparing ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />}
            生成复刻预览
          </Button>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {preview ? (
          <div className="overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/25 px-4 py-3">
              <div>
                <p className="font-medium">执行预览</p>
                <p className="text-xs text-muted-foreground">生成于 {formatTime(preview.createdAt)} · 60 秒内有效 · 比例 {preview.ratio} · 仓位滑点 {preview.maxSlippagePercent}%</p>
              </div>
              {newerEventCount > 0 ? <Badge className="bg-blue-500/10 text-blue-600">另有 {newerEventCount} 条新变化</Badge> : null}
            </div>
            <div className="divide-y">
              {preview.items.map((item) => {
                const result = results.get(item.id);
                const isPositionItem = item.sourceOid.startsWith('position:');
                return (
                  <div key={item.id} className="grid gap-3 px-4 py-3 md:grid-cols-[90px_1fr_auto] md:items-center">
                    <Badge
                      variant="outline"
                      className={cn(
                        'w-fit',
                        item.decision === 'place' && 'border-emerald-500/30 text-emerald-600',
                        item.decision === 'position' && 'border-blue-500/30 text-blue-600',
                        item.decision === 'cancel' && 'border-red-500/30 text-red-600',
                      )}
                    >
                      {previewLabel(item.decision)}
                    </Badge>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.coin}</span>
                        <span className="font-mono text-xs text-muted-foreground">{isPositionItem ? '目标仓位' : `源单 ${compactOid(item.sourceOid)}`}</span>
                        {item.followerOid ? <span className="font-mono text-xs text-muted-foreground">跟单 {compactOid(item.followerOid)}</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                    <div className="text-left md:text-right">
                      {isPositionItem && item.decision === 'position' ? (
                        <>
                          <p className={cn('font-medium', item.side === 'buy' ? 'text-emerald-600' : 'text-red-600')}>
                            {item.side === 'buy' ? '买入' : '卖出'} {item.copiedSize} {item.coin}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">当前 {item.followerSize} → 目标 {item.targetSize} · IOC 限价 {item.price}</p>
                        </>
                      ) : null}
                      {isPositionItem && item.decision === 'skip' ? (
                        <p className="font-mono text-xs text-muted-foreground">当前 {item.followerSize} · 目标 {item.targetSize}</p>
                      ) : null}
                      {item.decision === 'place' ? (
                        <>
                          <p className={cn('font-medium', item.side === 'buy' ? 'text-emerald-600' : 'text-red-600')}>
                            {item.side === 'buy' ? '买入' : '卖出'} {item.copiedSize} {item.coin}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">@ {item.price} · {item.tif}{item.reduceOnly ? ' · 只减仓' : ''}</p>
                        </>
                      ) : null}
                      {result ? (
                        <p className={cn('mt-1 flex items-center gap-1 text-xs md:justify-end', result.status === 'failed' ? 'text-destructive' : 'text-emerald-600')}>
                          {result.status === 'failed' ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}{result.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/25 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4" />
                点击确认前不会签名，也不会向交易所提交订单。
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={discardPreview}><Ban />忽略本批</Button>
                {results.size > 0 && [...results.values()].some((result) => result.status === 'failed') ? (
                  <Button variant="outline" onClick={() => void createPreview()}><RotateCcw />重新预览</Button>
                ) : null}
                <Button
                  disabled={executableCount === 0 || results.size > 0}
                  onClick={() => setConfirmOpen(true)}
                >
                  <Check />核对并确认
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            开始监控取得目标账户数据后，可在这里生成当前仓位与挂单的等比例复刻预览。
          </div>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={(open) => {
        if (!executing) setConfirmOpen(open);
        if (!open) setConfirmed(false);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>确认提交真实订单</DialogTitle>
            <DialogDescription>
              将在 {preview?.network === 'mainnet' ? 'Hyperliquid 主网' : 'Hyperliquid 测试网'}提交 {executableCount} 项操作。签名只在当前浏览器内完成。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 p-3 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">限价单也可能立即成交</p>
            <p className="mt-1 text-xs text-muted-foreground">从观察到确认之间市场可能变化，GTC 限价单提交时可能成为吃单。请再次核对价格、方向、数量和网络。</p>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>我已核对本次预览，确认使用已配置的 API Wallet 提交真实订单。</span>
          </label>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={executing} />}>取消</DialogClose>
            <Button variant="destructive" disabled={!confirmed || executing} onClick={() => void confirmExecution()}>
              {executing ? <LoaderCircle className="animate-spin" /> : <Check />}
              {executing ? '正在签名并提交' : '确认提交'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
