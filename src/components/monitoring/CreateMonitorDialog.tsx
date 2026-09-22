'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { LoaderCircle, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useAaveReserves, useBinanceMarkets, useEvmRpcIntegrations, useUniswapPools, useUniswapWalletPositions,
} from '@/hooks/useCryptoSentry';
import { cn } from '@/lib/utils';
import type {
  CryptoSentryMonitor, IntegrationCatalog, IntegrationReadiness, MonitorCreateInput, MonitorType, MonitorUpdateInput,
  UniswapVersion,
} from '@/types/cryptoSentry';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
type AvailableType = Exclude<MonitorType, 'aave_position' | 'lp_position'>;

const TYPES: Array<{ id: AvailableType; title: string; description: string }> = [
  { id: 'market', title: 'Binance 行情', description: '价格、成交量、资金费率和 OI' },
  { id: 'aave_account', title: 'Aave 地址', description: '账户仓位、健康因子与资金变化' },
  { id: 'aave_pool', title: 'Aave 池子', description: '大额 Supply / Borrow / Liquidation 事件' },
  { id: 'uniswap_position', title: 'Uniswap 单个 LP', description: '从钱包仓位中选择一个 NFT' },
  { id: 'uniswap_wallet', title: 'Uniswap 地址 LP', description: '跨网络和 V3/V4 自动发现' },
  { id: 'uniswap_pool', title: 'Uniswap 池子', description: '价格、TVL、成交量和链上事件' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: IntegrationCatalog;
  readiness: IntegrationReadiness;
  onCreate: (input: MonitorCreateInput) => Promise<CryptoSentryMonitor>;
  monitor?: CryptoSentryMonitor;
  onUpdate?: (input: MonitorUpdateInput) => Promise<CryptoSentryMonitor>;
}

export function CreateMonitorDialog({ open, onOpenChange, catalog, readiness, onCreate, monitor, onUpdate }: Props) {
  const editing = monitor !== undefined;
  const initialType = monitor?.type && !['aave_position', 'lp_position'].includes(monitor.type)
    ? monitor.type as AvailableType : 'market';
  const initialIntervalMode = monitor
    ? catalog.samplingPresets.find((item) => item.intervalSeconds === monitor.intervalSeconds)?.id ?? 'custom'
    : 'standard';
  const [type, setType] = useState<AvailableType>(initialType);
  const [name, setName] = useState(monitor?.name ?? '');
  const [intervalMode, setIntervalMode] = useState(initialIntervalMode);
  const [interval, setIntervalValue] = useState(String(monitor?.intervalSeconds ?? 20));
  const [maxStale, setMaxStale] = useState(String(monitor?.maxStaleSeconds ?? 90));
  const [rpcId, setRpcId] = useState(monitor?.config.rpcIntegrationId ?? '');
  const [chainId, setChainId] = useState(monitor?.config.chainId ?? 1);
  const [version, setVersion] = useState<UniswapVersion>(monitor?.config.version ?? 'v3');
  const [wallet, setWallet] = useState(monitor?.config.walletAddress ?? '');
  const [tokenId, setTokenId] = useState(monitor?.config.tokenId ?? '');
  const [marketType, setMarketType] = useState<'spot' | 'perpetual'>(monitor?.config.marketType ?? 'spot');
  const [marketSymbol, setMarketSymbol] = useState(monitor?.config.providerSymbol ?? monitor?.config.poolAddress ?? monitor?.config.poolId ?? '');
  const [search, setSearch] = useState('');
  const [selectedReserves, setSelectedReserves] = useState<string[]>(monitor?.config.reserveAssetAddresses ?? []);
  const [selectedChains, setSelectedChains] = useState<number[]>(monitor?.config.chainIds ?? [1]);
  const [selectedVersions, setSelectedVersions] = useState<UniswapVersion[]>(monitor?.config.versions ?? ['v3']);
  const [discover, setDiscover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const rpcQuery = useEvmRpcIntegrations();
  const readyRpcIds = useMemo(() => {
    const ids = new Set<string>();
    for (const network of readiness.aave.networks) for (const id of network.integrationIds) ids.add(id);
    for (const network of readiness.uniswap?.networks ?? []) for (const id of network.integrationIds) ids.add(id);
    return ids;
  }, [readiness]);
  const rpcOptions = (rpcQuery.data ?? []).filter((rpc) => rpc.enabled && (
    readyRpcIds.has(rpc.id) || rpc.id === monitor?.config.rpcIntegrationId
  ));
  const selectedRpc = rpcOptions.find((rpc) => rpc.id === rpcId) ?? rpcOptions[0] ?? null;
  const selectedRpcId = selectedRpc?.id ?? null;
  const aaveNetwork = readiness.aave.networks.find((network) => network.chainId === 1);
  const aaveRpcId = aaveNetwork?.integrationIds.includes(rpcId) ? rpcId : aaveNetwork?.integrationIds[0] ?? null;
  const availableNetworks = (readiness.uniswap?.networks ?? []).filter((network) => selectedRpcId && network.integrationIds.includes(selectedRpcId));
  const selectedNetwork = availableNetworks.find((network) => network.chainId === chainId) ?? availableNetworks[0];
  const effectiveChainId = selectedNetwork?.chainId ?? chainId;
  const effectiveVersion = selectedNetwork?.versions[version] ? version : selectedNetwork?.versions.v3 ? 'v3' : 'v4';
  const binanceId = readiness.binance.sources.find((source) => source.enabled)?.integrationId ?? null;

  const marketsQuery = useBinanceMarkets(type === 'market' ? binanceId : null);
  const reservesQuery = useAaveReserves(
    type.startsWith('aave') ? aaveRpcId : null,
    1,
  );
  const poolsQuery = useUniswapPools(type === 'uniswap_pool' ? selectedRpcId : null, effectiveChainId, effectiveVersion, search);
  const walletPositionsQuery = useUniswapWalletPositions(
    type === 'uniswap_position' ? selectedRpcId : null,
    effectiveChainId,
    effectiveVersion,
    wallet.trim(),
    search,
    discover && ADDRESS.test(wallet.trim()),
  );

  const markets = useMemo(() => (marketsQuery.data?.items ?? []).filter((market) => market.marketType === marketType && (
    !search.trim() || market.providerSymbol.toLowerCase().includes(search.toLowerCase()) || market.canonicalSymbol.toLowerCase().includes(search.toLowerCase())
  )).slice(0, 80), [marketType, marketsQuery.data, search]);

  const reset = () => {
    setType('market'); setName(''); setIntervalMode('standard'); setIntervalValue('20'); setMaxStale('90'); setRpcId(''); setChainId(1); setVersion('v3');
    setWallet(''); setTokenId(''); setMarketType('spot'); setMarketSymbol(''); setSearch(''); setSelectedReserves([]);
    setSelectedChains([1]); setSelectedVersions(['v3']); setDiscover(false); setError(null);
  };

  const buildConfig = (): MonitorCreateInput['config'] => {
    if (type === 'market') {
      if (!binanceId || !marketSymbol) throw new Error('请选择一个 Binance 市场');
      const market = marketsQuery.data?.items.find((item) => item.marketType === marketType && item.providerSymbol === marketSymbol);
      if (!market) {
        if (monitor && marketSymbol === monitor.config.providerSymbol) return { ...monitor.config };
        throw new Error('所选市场不存在');
      }
      return { integrationId: binanceId, marketType, providerSymbol: market.providerSymbol, canonicalSymbol: market.canonicalSymbol, priceType: marketType === 'spot' ? 'last' : 'mark' };
    }
    if (type === 'aave_account') {
      if (!aaveRpcId || !ADDRESS.test(wallet.trim())) throw new Error('请选择就绪的 Ethereum RPC 并填写有效钱包地址');
      return { rpcIntegrationId: aaveRpcId, chainId: 1, walletAddress: wallet.trim() };
    }
    if (type === 'aave_pool') {
      if (!aaveRpcId) throw new Error('Aave 数据源尚未就绪');
      return { rpcIntegrationId: aaveRpcId, chainId: 1, reserveAssetAddresses: selectedReserves };
    }
    if (!selectedRpcId) throw new Error('请选择可用的 EVM RPC');
    if (type === 'uniswap_position') {
      if (!tokenId) throw new Error('请先输入钱包地址并从发现结果中选择 LP');
      return { rpcIntegrationId: selectedRpcId, chainId: effectiveChainId, version: effectiveVersion, tokenId };
    }
    if (type === 'uniswap_wallet') {
      if (!ADDRESS.test(wallet.trim())) throw new Error('请输入有效钱包地址');
      const supportedChains = selectedChains.filter((id) => availableNetworks.some((network) => network.chainId === id));
      if (!supportedChains.length || !selectedVersions.length) throw new Error('请至少选择一个网络和版本');
      for (const selectedChainId of supportedChains) {
        const network = availableNetworks.find((item) => item.chainId === selectedChainId);
        for (const selectedVersion of selectedVersions) {
          if (network?.versions[selectedVersion] !== true) {
            throw new Error(`${network?.name ?? selectedChainId} 的 Uniswap ${selectedVersion.toUpperCase()} 尚未通过能力测试`);
          }
        }
      }
      return { rpcIntegrationId: selectedRpcId, chainIds: supportedChains, versions: selectedVersions, walletAddress: wallet.trim() };
    }
    const pool = poolsQuery.data?.items.find((item) => (item.poolAddress ?? item.poolId) === marketSymbol);
    if (!pool) {
      const existingPoolId = monitor?.config.poolAddress ?? monitor?.config.poolId;
      if (monitor && marketSymbol === existingPoolId && effectiveChainId === monitor.config.chainId && effectiveVersion === monitor.config.version) {
        return { ...monitor.config, rpcIntegrationId: selectedRpcId };
      }
      throw new Error('请从资源目录选择一个 Pool');
    }
    return { rpcIntegrationId: selectedRpcId, chainId: effectiveChainId, version: effectiveVersion, ...(effectiveVersion === 'v3' ? { poolAddress: pool.poolAddress as string } : { poolId: pool.poolId as string }) };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('请输入监控名称');
    const intervalSeconds = Number(interval);
    const maxStaleSeconds = Number(maxStale);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 86_400) return setError('采样间隔必须为 5–86400 秒');
    if (!Number.isInteger(maxStaleSeconds) || maxStaleSeconds < 5 || maxStaleSeconds > 86_400) return setError('过期阈值必须为 5–86400 秒');
    setSubmitting(true); setError(null);
    try {
      const config = buildConfig();
      if (editing) {
        if (!onUpdate) throw new Error('缺少更新处理器');
        await onUpdate({ name: name.trim(), intervalSeconds, maxStaleSeconds, config });
      } else {
        await onCreate({ name: name.trim(), type, enabled: true, intervalSeconds, maxStaleSeconds, config });
        reset();
      }
      onOpenChange(false);
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : editing ? '保存失败' : '创建失败'); }
    finally { setSubmitting(false); }
  };

  const typeReady = (candidate: AvailableType) => candidate === 'market' ? readiness.binance.ready : candidate.startsWith('aave') ? readiness.aave.ready : readiness.uniswap?.ready === true;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !submitting && !editing) reset(); onOpenChange(next); }}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader><DialogTitle>{editing ? '编辑监控任务' : '添加监控任务'}</DialogTitle><DialogDescription>{editing ? '可修改监控对象、采样频率和过期阈值；监控类型保持不变。' : '先选择监控对象，再从后端资源目录选择市场、资产、LP 或 Pool；无需查找协议合约地址。'}</DialogDescription></DialogHeader>
          <div className="space-y-5 py-1">
            {editing ? <div className="rounded-lg border bg-muted/35 px-3 py-2 text-sm"><span className="text-muted-foreground">监控类型：</span><span className="font-medium">{TYPES.find((item) => item.id === type)?.title ?? type}</span></div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TYPES.map((item) => <button key={item.id} type="button" disabled={!typeReady(item.id)} onClick={() => { setType(item.id); setSearch(''); setMarketSymbol(''); setError(null); }} className={cn('rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-45', type === item.id && 'border-primary bg-primary/5 ring-1 ring-primary/20')}><span className="text-sm font-semibold">{item.title}</span><span className="mt-1 block text-xs text-muted-foreground">{typeReady(item.id) ? item.description : '请先配置并测试数据源'}</span></button>)}
            </div>}

            <div className="grid gap-4 sm:grid-cols-[1fr_180px_180px]">
              <div className="space-y-2"><Label htmlFor="monitor-name">监控名称</Label><Input id="monitor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：BTC 永续异动" /></div>
              <div className="space-y-2"><Label htmlFor="monitor-interval">采样频率</Label><select id="monitor-interval" value={intervalMode} onChange={(event) => { const mode = event.target.value; setIntervalMode(mode); const preset = catalog.samplingPresets.find((item) => item.id === mode); if (preset) setIntervalValue(String(preset.intervalSeconds)); }} className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm">{catalog.samplingPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.id} · {preset.intervalSeconds}s</option>)}<option value="custom">自定义</option></select>{intervalMode === 'custom' ? <Input type="number" min={5} max={86400} value={interval} onChange={(event) => setIntervalValue(event.target.value)} placeholder="秒" /> : null}</div>
              <div className="space-y-2"><Label htmlFor="monitor-stale">数据过期（秒）</Label><Input id="monitor-stale" type="number" min={5} max={86400} value={maxStale} onChange={(event) => setMaxStale(event.target.value)} /></div>
            </div>

            {type === 'market' ? <div className="space-y-3 rounded-xl border p-4"><div className="flex gap-2"><select value={marketType} onChange={(event) => { setMarketType(event.target.value as 'spot' | 'perpetual'); setMarketSymbol(''); }} className="h-8 rounded-lg border bg-background px-2.5 text-sm"><option value="spot">现货</option><option value="perpetual">永续</option></select><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 BTCUSDT 或 BTC/USD" /></div><div className="max-h-48 overflow-y-auto rounded-lg border">{markets.map((market) => <button key={`${market.marketType}-${market.providerSymbol}`} type="button" onClick={() => setMarketSymbol(market.providerSymbol)} className={cn('flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0', marketSymbol === market.providerSymbol && 'bg-accent')}><span className="font-medium">{market.canonicalSymbol}</span><span className="font-mono text-xs text-muted-foreground">{market.providerSymbol}</span></button>)}</div></div> : null}

            {type === 'aave_account' ? <div className="space-y-3 rounded-xl border p-4"><div className="space-y-2"><Label htmlFor="aave-rpc">Ethereum RPC</Label><select id="aave-rpc" value={aaveRpcId ?? ''} onChange={(event) => setRpcId(event.target.value)} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{rpcOptions.filter((rpc) => aaveNetwork?.integrationIds.includes(rpc.id)).map((rpc) => <option key={rpc.id} value={rpc.id}>{rpc.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="aave-wallet">Ethereum 钱包地址</Label><Input id="aave-wallet" value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="0x…" className="font-mono text-xs" /></div><p className="text-xs text-muted-foreground">只监控 Ethereum Aave V3。</p></div> : null}

            {type === 'aave_pool' ? <div className="space-y-3 rounded-xl border p-4"><div className="space-y-2"><Label htmlFor="aave-pool-rpc">Ethereum RPC</Label><select id="aave-pool-rpc" value={aaveRpcId ?? ''} onChange={(event) => setRpcId(event.target.value)} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{rpcOptions.filter((rpc) => aaveNetwork?.integrationIds.includes(rpc.id)).map((rpc) => <option key={rpc.id} value={rpc.id}>{rpc.name}</option>)}</select></div><div><p className="text-sm font-medium">选择 Reserve</p><p className="text-xs text-muted-foreground">不选择表示监控全部 Reserve；无需填写 Aave 合约地址。</p></div>{reservesQuery.isLoading ? <p className="text-sm text-muted-foreground">正在读取 Aave 资源目录…</p> : <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">{reservesQuery.data?.items.map((reserve) => <label key={reserve.underlyingAsset} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={selectedReserves.includes(reserve.underlyingAsset)} onChange={() => setSelectedReserves((current) => current.includes(reserve.underlyingAsset) ? current.filter((address) => address !== reserve.underlyingAsset) : [...current, reserve.underlyingAsset])} /><span className="font-medium">{reserve.symbol}</span><span className="truncate text-xs text-muted-foreground">{reserve.name}</span></label>)}</div>}</div> : null}

            {type.startsWith('uniswap_') ? <div className="space-y-4 rounded-xl border p-4"><div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>RPC</Label><select value={selectedRpcId ?? ''} onChange={(event) => setRpcId(event.target.value)} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{rpcOptions.map((rpc) => <option key={rpc.id} value={rpc.id}>{rpc.name}</option>)}</select></div>{type !== 'uniswap_wallet' ? <><div className="space-y-2"><Label>网络</Label><select value={effectiveChainId} onChange={(event) => setChainId(Number(event.target.value))} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{availableNetworks.map((network) => <option key={network.chainId} value={network.chainId}>{network.name}</option>)}</select></div><div className="space-y-2"><Label>版本</Label><select value={effectiveVersion} onChange={(event) => setVersion(event.target.value as UniswapVersion)} className="h-8 w-full rounded-lg border bg-background px-2 text-sm">{(['v3', 'v4'] as const).filter((item) => selectedNetwork?.versions[item]).map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></div></> : null}</div>
              {type === 'uniswap_wallet' ? <><div className="space-y-2"><Label>钱包地址</Label><Input value={wallet} onChange={(event) => setWallet(event.target.value)} placeholder="0x…" className="font-mono text-xs" /></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>网络（可多选）</Label><div className="mt-2 flex flex-wrap gap-2">{availableNetworks.map((network) => <label key={network.chainId} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={selectedChains.includes(network.chainId)} onChange={() => setSelectedChains((current) => current.includes(network.chainId) ? current.filter((id) => id !== network.chainId) : [...current, network.chainId])} />{network.name}</label>)}</div></div><div><Label>版本（可多选）</Label><div className="mt-2 flex gap-2">{(['v3', 'v4'] as const).map((item) => { const unavailable = selectedChains.some((id) => availableNetworks.find((network) => network.chainId === id)?.versions[item] !== true); const selected = selectedVersions.includes(item); return <label key={item} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', unavailable && !selected && 'opacity-45')}><input type="checkbox" disabled={unavailable && !selected} checked={selected} onChange={() => setSelectedVersions((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />{item.toUpperCase()}</label>; })}</div></div></div></> : null}
              {type === 'uniswap_position' ? <><div className="flex gap-2"><Input value={wallet} onChange={(event) => { setWallet(event.target.value); setDiscover(false); }} placeholder="输入持有 LP 的钱包地址" className="font-mono text-xs" /><Button type="button" variant="outline" onClick={() => setDiscover(true)} disabled={!ADDRESS.test(wallet.trim())}><Search />发现 LP</Button></div>{walletPositionsQuery.isFetching ? <p className="text-sm text-muted-foreground">正在读取钱包 LP…</p> : <div className="max-h-52 overflow-y-auto rounded-lg border">{walletPositionsQuery.data?.items.map((position) => <button type="button" key={position.tokenId} onClick={() => setTokenId(position.tokenId)} className={cn('flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0', tokenId === position.tokenId && 'bg-accent')}><span>{position.token0.symbol ?? 'Token0'} / {position.token1.symbol ?? 'Token1'} <Badge variant="outline">#{position.tokenId}</Badge></span><span className="text-xs text-muted-foreground">{position.inRange === true ? '区间内' : position.inRange === false ? '区间外' : '范围未知'}</span></button>)}{discover && walletPositionsQuery.data?.items.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">未发现该网络/版本 LP</p> : null}</div>}</> : null}
              {type === 'uniswap_pool' ? <><div className="relative"><Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 ETH/USDC、Token、Pool 地址或费率" className="pl-8" /></div><div className="max-h-56 overflow-y-auto rounded-lg border">{poolsQuery.data?.items.map((pool) => { const id = pool.poolAddress ?? pool.poolId ?? ''; return <button type="button" key={id} onClick={() => setMarketSymbol(id)} className={cn('flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0', marketSymbol === id && 'bg-accent')}><span className="font-medium">{pool.token0.symbol ?? 'Token0'} / {pool.token1.symbol ?? 'Token1'}</span><span className="font-mono text-xs text-muted-foreground">{pool.version.toUpperCase()} {pool.feeTier ?? pool.tickSpacing ?? ''}</span></button>; })}{poolsQuery.data?.status === 'warming_up' ? <p className="p-3 text-xs text-amber-600">Pool 目录仍在后台索引，当前结果可先使用。</p> : null}</div></> : null}
            </div> : null}

            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button><Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="animate-spin" /> : null}{submitting ? editing ? '正在保存' : '正在创建' : editing ? '保存修改' : '创建监控'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
