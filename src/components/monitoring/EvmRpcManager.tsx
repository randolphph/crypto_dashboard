'use client';

import { useState } from 'react';
import { CheckCircle2, CircleOff, LoaderCircle, Pencil, Plus, RadioTower, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { RpcIntegrationDialog } from '@/components/monitoring/RpcIntegrationDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useCreateAndTestRpcIntegration, useDeleteIntegration, useEvmRpcIntegrations,
  useSetIntegrationEnabled, useTestIntegration, useUpdateAndTestRpcIntegration,
} from '@/hooks/useCryptoSentry';
import type {
  EvmRpcIntegration, IntegrationCatalog, IntegrationReadiness, IntegrationTestResult,
  RpcIntegrationInput, RpcIntegrationUpdateInput, RpcSetupResult,
} from '@/types/cryptoSentry';

interface Props { catalog: IntegrationCatalog['evmRpc']; readiness: IntegrationReadiness }

function routingLabel(mode: string) {
  return { fixed: '单链', url_template: 'URL 模板', header: 'Header 选链', query: 'Query 选链' }[mode] ?? mode;
}

export function EvmRpcManager({ catalog, readiness }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EvmRpcIntegration | null>(null);
  const [deleting, setDeleting] = useState<EvmRpcIntegration | null>(null);
  const [tests, setTests] = useState<Record<string, IntegrationTestResult>>({});
  const [error, setError] = useState<string | null>(null);
  const integrationsQuery = useEvmRpcIntegrations();
  const createRpc = useCreateAndTestRpcIntegration();
  const updateRpc = useUpdateAndTestRpcIntegration();
  const testRpc = useTestIntegration();
  const toggleRpc = useSetIntegrationEnabled();
  const deleteRpc = useDeleteIntegration();

  const remember = (result: RpcSetupResult) => {
    setTests((current) => ({ ...current, [result.integration.id]: result.test }));
    return result;
  };
  const create = async (input: RpcIntegrationInput) => remember(await createRpc.mutateAsync(input));
  const update = async (input: RpcIntegrationUpdateInput) => remember(await updateRpc.mutateAsync(input));
  const test = async (integration: EvmRpcIntegration) => {
    setError(null);
    try {
      const result = await testRpc.mutateAsync(integration.id);
      setTests((current) => ({ ...current, [integration.id]: result }));
    } catch (testError) { setError(testError instanceof Error ? testError.message : 'RPC 测试失败'); }
  };

  return (
    <div className="flex min-w-0 flex-col rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">EVM RPC</p>
            <Badge variant={readiness.aave.ready ? 'default' : 'secondary'}>Aave {readiness.aave.ready ? '就绪' : '未就绪'}</Badge>
            <Badge variant={readiness.uniswap?.ready ? 'default' : 'secondary'}>Uniswap {readiness.uniswap?.ready ? '就绪' : '未就绪'}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">一个 RPC Integration 可通过 URL、Header 或 Query 路由多条链。</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus /> 添加 RPC</Button>
      </div>

      {error ? <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</p> : null}
      <div className="mt-4 space-y-2">
        {integrationsQuery.isLoading ? <div className="h-24 animate-pulse rounded-lg bg-muted" /> : null}
        {integrationsQuery.error ? <p className="rounded-lg border p-3 text-sm text-destructive">{integrationsQuery.error.message}</p> : null}
        {integrationsQuery.data?.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">尚未配置 EVM RPC</p> : null}
        {integrationsQuery.data?.map((integration) => {
          const lastTest = tests[integration.id];
          const isTesting = testRpc.isPending && testRpc.variables === integration.id;
          return (
            <div key={integration.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{integration.name}</p>
                    <Badge variant={integration.enabled ? 'outline' : 'secondary'}>{integration.enabled ? '已启用' : '已停用'}</Badge>
                    <Badge variant="secondary">{routingLabel(integration.config.routing.mode)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{integration.provider} · {integration.config.chainIds.length} 条链 · URL 已加密</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {integration.config.chainIds.map((chainId) => {
                      const network = catalog.networks.find((item) => item.chainId === chainId);
                      const result = lastTest?.networks?.find((item) => item.chainId === chainId);
                      return <Badge key={chainId} variant="outline" className={result?.ok ? 'border-emerald-500/40' : result && !result.ok ? 'border-destructive/40' : undefined}>{result?.ok ? <CheckCircle2 /> : result ? <XCircle /> : null}{network?.name ?? chainId}</Badge>;
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => test(integration)} disabled={!integration.enabled || isTesting}>{isTesting ? <LoaderCircle className="animate-spin" /> : <RadioTower />}测试</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(integration)}><Pencil />编辑</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleRpc.mutate({ id: integration.id, enabled: !integration.enabled })} disabled={toggleRpc.isPending}><CircleOff />{integration.enabled ? '停用' : '启用'}</Button>
                  <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(integration)} aria-label={`删除 ${integration.name}`}><Trash2 /></Button>
                </div>
              </div>
              {lastTest ? (
                <div className="mt-3 space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                  {lastTest.networks?.map((network) => (
                    <p key={network.chainId}>{network.chainName}：RPC {network.connectivity.rpc ?? 'unknown'} · Aave {network.connectivity.aaveV3 ?? '不适用'} · Uni V3 {network.connectivity.uniswapV3 ?? '不适用'} · Uni V4 {network.connectivity.uniswapV4 ?? '不适用'} · 区块 {network.blockNumber ?? '—'}</p>
                  )) ?? <p>连接测试{lastTest.ok ? '通过' : '未完全通过'}</p>}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end"><Button variant="ghost" size="sm" onClick={() => integrationsQuery.refetch()}><RefreshCw className={integrationsQuery.isFetching ? 'animate-spin' : undefined} />刷新列表</Button></div>

      <RpcIntegrationDialog open={createOpen} onOpenChange={setCreateOpen} catalog={catalog} onCreate={create} />
      {editing ? <RpcIntegrationDialog key={editing.id} open onOpenChange={(open) => !open && setEditing(null)} catalog={catalog} integration={editing} onCreate={create} onUpdate={update} /> : null}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>删除 EVM RPC？</DialogTitle><DialogDescription>如果有 Monitor 正在引用“{deleting?.name}”，后端会拒绝删除。</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" onClick={async () => { if (!deleting) return; try { await deleteRpc.mutateAsync(deleting.id); setDeleting(null); } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : '删除失败'); setDeleting(null); } }} disabled={deleteRpc.isPending}><Trash2 />确认删除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
