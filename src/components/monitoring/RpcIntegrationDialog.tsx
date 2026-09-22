'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  EvmRpcIntegration, EvmRpcProvider, EvmRpcRouting, IntegrationCatalog,
  RpcIntegrationInput, RpcIntegrationUpdateInput, RpcRoutingMode, RpcSetupResult,
} from '@/types/cryptoSentry';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: IntegrationCatalog['evmRpc'];
  integration?: EvmRpcIntegration;
  onCreate: (input: RpcIntegrationInput) => Promise<RpcSetupResult>;
  onUpdate?: (input: RpcIntegrationUpdateInput) => Promise<RpcSetupResult>;
}

function parseHeaders(value: string): Record<string, string> | null {
  if (!value.trim()) return null;
  const result: Record<string, string> = {};
  for (const line of value.split('\n')) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator < 1 || !line.slice(separator + 1).trim()) throw new Error(`Header 格式错误：${line}`);
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return result;
}

export function RpcIntegrationDialog({ open, onOpenChange, catalog, integration, onCreate, onUpdate }: Props) {
  const existing = integration?.config;
  const [provider, setProvider] = useState<EvmRpcProvider>((integration?.provider as EvmRpcProvider) ?? 'custom');
  const [name, setName] = useState(integration?.name ?? 'EVM 多链 RPC');
  const [rpcUrl, setRpcUrl] = useState(existing?.rpcUrl ?? '');
  const [chainIds, setChainIds] = useState<number[]>(existing?.chainIds ?? [catalog.networks.find((n) => n.productEnabled)?.chainId ?? 1]);
  const [routingMode, setRoutingMode] = useState<RpcRoutingMode>(existing?.routing.mode ?? 'url_template');
  const [placeholder, setPlaceholder] = useState(existing?.routing.mode === 'url_template' ? existing.routing.chainIdPlaceholder ?? '{chainId}' : '{chainId}');
  const [headerName, setHeaderName] = useState(existing?.routing.mode === 'header' ? existing.routing.headerName : 'X-Chain-Id');
  const [valueTemplate, setValueTemplate] = useState(existing?.routing.mode === 'header' ? existing.routing.valueTemplate ?? '{chainId}' : '{chainId}');
  const [parameterName, setParameterName] = useState(existing?.routing.mode === 'query' ? existing.routing.parameterName : 'chainId');
  const [headersText, setHeadersText] = useState(existing?.headers ? Object.entries(existing.headers).map(([key, value]) => `${key}: ${value}`).join('\n') : '');
  const [timeout, setTimeoutValue] = useState(String(existing?.timeoutMilliseconds ?? catalog.configDefaults.timeoutMilliseconds));
  const [batchSize, setBatchSize] = useState(String(existing?.multicallBatchSizeBytes ?? catalog.configDefaults.multicallBatchSizeBytes));
  const [showUrl, setShowUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const productNetworks = useMemo(() => catalog.networks.filter((network) => network.productEnabled), [catalog.networks]);

  const toggleChain = (chainId: number) => {
    setChainIds((current) => current.includes(chainId) ? current.filter((id) => id !== chainId) : [...current, chainId]);
    setError(null);
  };

  const buildRouting = (): EvmRpcRouting => {
    if (routingMode === 'fixed') return { mode: 'fixed' };
    if (routingMode === 'url_template') return { mode: 'url_template', chainIdPlaceholder: placeholder.trim() || '{chainId}' };
    if (routingMode === 'header') return { mode: 'header', headerName: headerName.trim(), valueTemplate: valueTemplate.trim() || '{chainId}' };
    return { mode: 'query', parameterName: parameterName.trim() };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !rpcUrl.trim()) return setError('请填写名称和 RPC URL');
    if (chainIds.length === 0) return setError('请至少选择一条链');
    if (routingMode === 'fixed' && chainIds.length !== 1) return setError('单链路由只能选择一条链');
    if (routingMode === 'url_template' && rpcUrl !== '********' && !rpcUrl.includes(placeholder.trim() || '{chainId}')) {
      return setError('URL 模板中必须包含链 ID 占位符');
    }
    if (routingMode === 'header' && !headerName.trim()) return setError('请填写选链 Header 名称');
    if (routingMode === 'query' && !parameterName.trim()) return setError('请填写选链查询参数名');
    const timeoutNumber = Number(timeout);
    const batchNumber = Number(batchSize);
    if (!Number.isInteger(timeoutNumber) || timeoutNumber < 1_000 || timeoutNumber > 60_000) return setError('超时需为 1,000–60,000 毫秒');
    if (!Number.isInteger(batchNumber) || batchNumber < 1_024 || batchNumber > 100_000) return setError('Multicall 批次需为 1,024–100,000 字节');
    let headers: Record<string, string> | null;
    try { headers = parseHeaders(headersText); } catch (parseError) {
      return setError(parseError instanceof Error ? parseError.message : 'Header 格式错误');
    }
    const input: RpcIntegrationInput = {
      name: name.trim(), provider, rpcUrl: rpcUrl.trim(), chainIds: [...chainIds].sort((a, b) => a - b),
      routing: buildRouting(), headers, timeoutMilliseconds: timeoutNumber, multicallBatchSizeBytes: batchNumber,
    };
    setError(null);
    setSubmitting(true);
    try {
      if (integration && onUpdate) await onUpdate({ ...input, id: integration.id });
      else await onCreate(input);
      onOpenChange(false);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'RPC 保存或测试失败');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{integration ? '编辑 EVM RPC' : '添加 EVM RPC'}</DialogTitle>
            <DialogDescription>
              一个 Integration 可覆盖多条链；URL 与认证 Header 只提交给后端加密保存，不写入浏览器存储。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rpc-provider">服务商</Label>
                <select id="rpc-provider" value={provider} onChange={(event) => setProvider(event.target.value as EvmRpcProvider)} disabled={Boolean(integration)} className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
                  {catalog.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rpc-name">名称</Label>
                <Input id="rpc-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>覆盖网络</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {productNetworks.map((network) => (
                  <label key={network.chainId} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                    <input type="checkbox" className="mt-0.5 size-4 accent-foreground" checked={chainIds.includes(network.chainId)} onChange={() => toggleChain(network.chainId)} />
                    <span><span className="block text-sm font-medium">{network.name}</span><span className="font-mono text-xs text-muted-foreground">Chain ID {network.chainId}</span></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rpc-routing">选链方式</Label>
                <select id="rpc-routing" value={routingMode} onChange={(event) => setRoutingMode(event.target.value as RpcRoutingMode)} className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
                  {catalog.routingModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name}</option>)}
                </select>
              </div>
              {routingMode === 'url_template' ? (
                <div className="space-y-2"><Label htmlFor="rpc-placeholder">URL 占位符</Label><Input id="rpc-placeholder" value={placeholder} onChange={(event) => setPlaceholder(event.target.value)} className="font-mono text-xs" /></div>
              ) : routingMode === 'header' ? (
                <div className="grid grid-cols-2 gap-2"><div className="space-y-2"><Label htmlFor="rpc-header-name">Header</Label><Input id="rpc-header-name" value={headerName} onChange={(event) => setHeaderName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="rpc-header-template">值模板</Label><Input id="rpc-header-template" value={valueTemplate} onChange={(event) => setValueTemplate(event.target.value)} /></div></div>
              ) : routingMode === 'query' ? (
                <div className="space-y-2"><Label htmlFor="rpc-query-name">Query 参数名</Label><Input id="rpc-query-name" value={parameterName} onChange={(event) => setParameterName(event.target.value)} /></div>
              ) : <p className="self-end pb-2 text-xs text-muted-foreground">普通 RPC URL，仅允许一条链。</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rpc-url">RPC URL{routingMode === 'url_template' ? ' 模板' : ''}</Label>
              <div className="relative">
                <Input id="rpc-url" type={showUrl ? 'text' : 'password'} value={rpcUrl} onChange={(event) => setRpcUrl(event.target.value)} placeholder={routingMode === 'url_template' ? 'https://gateway.example/{chainId}/rpc' : 'https://…'} className="pr-9 font-mono text-xs" autoComplete="new-password" spellCheck={false} />
                <button type="button" onClick={() => setShowUrl((value) => !value)} className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground" aria-label={showUrl ? '隐藏 RPC URL' : '显示 RPC URL'}>{showUrl ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </div>
            </div>

            <details>
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">认证 Header 与高级设置</summary>
              <div className="mt-3 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rpc-headers">静态 Header（每行一个，格式 Name: Value）</Label>
                  <textarea id="rpc-headers" value={headersText} onChange={(event) => setHeadersText(event.target.value)} placeholder={'Authorization: Bearer secret\nX-API-Key: secret'} className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs" autoComplete="off" spellCheck={false} />
                  <p className="text-xs text-muted-foreground">编辑时保留 ******** 即保留原密文；清空此处会删除全部静态 Header。</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="rpc-timeout">超时（毫秒）</Label><Input id="rpc-timeout" type="number" value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="rpc-batch">Multicall 批次（字节）</Label><Input id="rpc-batch" type="number" value={batchSize} onChange={(event) => setBatchSize(event.target.value)} /></div>
                </div>
              </div>
            </details>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="animate-spin" /> : null}{submitting ? '正在保存并逐链测试' : '保存并测试'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
