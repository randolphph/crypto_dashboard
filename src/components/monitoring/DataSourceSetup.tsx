'use client';

import {
  CheckCircle2,
  DatabaseZap,
  LoaderCircle,
  RefreshCw,
  Server,
  TriangleAlert,
} from 'lucide-react';
import { EvmRpcManager } from '@/components/monitoring/EvmRpcManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfigureBinance } from '@/hooks/useCryptoSentry';
import { formatDateTime } from '@/lib/cryptoSentry/format';
import type { IntegrationCatalog, IntegrationReadiness } from '@/types/cryptoSentry';

function ReadyBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <Badge className="bg-emerald-600 text-white dark:bg-emerald-500">
      <CheckCircle2 /> 已就绪
    </Badge>
  ) : (
    <Badge variant="secondary">
      <TriangleAlert /> 待配置
    </Badge>
  );
}

interface DataSourceSetupProps {
  catalog: IntegrationCatalog | undefined;
  readiness: IntegrationReadiness | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  onRefresh: () => void;
}

export function DataSourceSetup({
  catalog,
  readiness,
  isLoading,
  isFetching,
  error,
  onRefresh,
}: DataSourceSetupProps) {
  const configureBinance = useConfigureBinance();
  const uniswapReadiness = readiness?.uniswap ?? {
    ready: false,
    configuredNetworkCount: 0,
    networks: [],
  };
  const readyCount =
    Number(readiness?.aave.ready === true) +
    Number(readiness?.binance.ready === true) +
    Number(uniswapReadiness.ready);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZap className="size-4" /> 数据源配置
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              市场行情和链上仓位由 CryptoSentry 云端持续采集。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {readiness ? (
              <Badge variant="outline">{readyCount}/3 已就绪</Badge>
            ) : null}
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
              刷新
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            无法读取数据源状态：{error.message}
          </div>
        ) : null}

        {isLoading || !catalog || !readiness ? (
          <div className="grid gap-3 md:grid-cols-2" aria-label="正在加载数据源配置">
            <div className="h-44 animate-pulse rounded-xl bg-muted" />
            <div className="h-44 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex min-w-0 flex-col rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                    <Server className="size-5" />
                  </div>
                  <div>
                    <p className="font-semibold">Binance 行情</p>
                    <p className="text-xs text-muted-foreground">公开 REST + WebSocket</p>
                  </div>
                </div>
                <ReadyBadge ready={readiness.binance.ready} />
              </div>

              <div className="mt-4 flex-1 space-y-2 text-sm">
                {readiness.binance.sources.length > 0 ? (
                  readiness.binance.sources.map((source) => (
                    <div key={source.integrationId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/55 px-3 py-2">
                      <span className="min-w-0 truncate">{source.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {source.marketCount.toLocaleString('en-US')} 个市场
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    无需 API Key，一键创建后会测试连接并同步现货和永续市场。
                  </p>
                )}
                {configureBinance.data ? (
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    已同步 {configureBinance.data.markets.total.toLocaleString('en-US')} 个市场
                    （现货 {configureBinance.data.markets.spot.toLocaleString('en-US')}，永续{' '}
                    {configureBinance.data.markets.perpetual.toLocaleString('en-US')}）
                  </p>
                ) : null}
                {configureBinance.error ? (
                  <p role="alert" className="text-xs text-destructive">
                    {configureBinance.error.message}
                  </p>
                ) : null}
              </div>

              <Button
                className="mt-4 self-start"
                variant={readiness.binance.ready ? 'outline' : 'default'}
                onClick={() => configureBinance.mutate()}
                disabled={configureBinance.isPending}
              >
                {configureBinance.isPending ? <LoaderCircle className="animate-spin" /> : null}
                {configureBinance.isPending
                  ? '正在测试并同步'
                  : readiness.binance.ready
                    ? '重新测试并同步'
                    : '一键配置 Binance'}
              </Button>
            </div>

            <EvmRpcManager catalog={catalog.evmRpc} readiness={readiness} />
          </div>
        )}

        {configureBinance.data ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            最近同步：{formatDateTime(configureBinance.data.markets.synchronizedAt)}
          </p>
        ) : null}
      </CardContent>

    </Card>
  );
}
