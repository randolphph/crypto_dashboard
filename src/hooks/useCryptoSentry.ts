'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cryptoSentryRequest } from '@/lib/cryptoSentry/client';
import type {
  AaveReserveCatalog,
  AlertListResponse,
  AlertStatus,
  BinanceMarketListResponse,
  BinanceSetupResult,
  CryptoSentryAlert,
  CryptoSentryIntegration,
  CryptoSentryMonitor,
  EvmRpcIntegration,
  IntegrationCatalog,
  IntegrationListResponse,
  IntegrationReadiness,
  IntegrationTestResult,
  MarketSyncResult,
  MonitorCreateInput,
  MonitorListResponse,
  MonitorSnapshot,
  MonitorUpdateInput,
  RpcIntegrationInput,
  RpcIntegrationUpdateInput,
  RpcSetupResult,
  RuleCreateInput,
  RuleGroup,
  RuleListResponse,
  RuntimeMonitorStatusResponse,
  SystemStatusSummary,
  UniswapPoolCatalogResponse,
  UniswapVersion,
  UniswapWalletPositionsResponse,
} from '@/types/cryptoSentry';

export const cryptoSentryKeys = {
  catalog: ['crypto-sentry', 'catalog'] as const,
  readiness: ['crypto-sentry', 'readiness'] as const,
  integrations: ['crypto-sentry', 'integrations'] as const,
  monitors: ['crypto-sentry', 'monitors'] as const,
  snapshot: (id: string) => ['crypto-sentry', 'snapshot', id] as const,
  rules: ['crypto-sentry', 'rules'] as const,
  alerts: (status: AlertStatus | 'all') => ['crypto-sentry', 'alerts', status] as const,
  system: ['crypto-sentry', 'system'] as const,
  runtimeMonitors: ['crypto-sentry', 'runtime-monitors'] as const,
  markets: (id: string) => ['crypto-sentry', 'markets', id] as const,
  reserves: (id: string, chainId: number) => ['crypto-sentry', 'reserves', id, chainId] as const,
  pools: (id: string, chainId: number, version: UniswapVersion, q: string) =>
    ['crypto-sentry', 'pools', id, chainId, version, q] as const,
  walletPositions: (id: string, chainId: number, version: UniswapVersion, wallet: string, q: string) =>
    ['crypto-sentry', 'wallet-positions', id, chainId, version, wallet, q] as const,
};

function normalizeCatalog(value: IntegrationCatalog): IntegrationCatalog {
  const legacyNetworks = value.evmRpc.networks as Array<IntegrationCatalog['evmRpc']['networks'][number] & { protocols?: string[] }>;
  return {
    ...value,
    samplingPresets: value.samplingPresets ?? [
      { id: 'realtime', intervalSeconds: 5 },
      { id: 'standard', intervalSeconds: 20 },
      { id: 'economy', intervalSeconds: 60 },
    ],
    ruleMetrics: value.ruleMetrics ?? {},
    monitorTypes: value.monitorTypes ?? [],
    aave: value.aave ?? { deployments: [] },
    uniswap: value.uniswap ?? { deployments: [] },
    evmRpc: {
      ...value.evmRpc,
      routingModes: value.evmRpc.routingModes ?? [
        { id: 'fixed', name: '单链' },
        { id: 'url_template', name: 'URL 模板' },
        { id: 'header', name: 'Header 选链' },
        { id: 'query', name: 'Query 选链' },
      ],
      networks: legacyNetworks.map((network) => ({
        ...network,
        productEnabled: network.productEnabled ?? [1, 4_663].includes(network.chainId),
        capabilities: network.capabilities ?? {
          aaveV3: network.protocols?.includes('aave_v3') ? 'available' : 'unsupported',
          uniswapV3: network.protocols?.includes('uniswap_v3') ? 'available' : 'unsupported',
          uniswapV4: network.protocols?.includes('uniswap_v4') ? 'available' : 'unsupported',
        },
      })),
    },
  };
}

function normalizeIntegration(integration: CryptoSentryIntegration): CryptoSentryIntegration {
  if (integration.type !== 'evm_rpc') return integration;
  const config = integration.config;
  const legacyChainId = typeof config.chainId === 'number' ? config.chainId : null;
  return {
    ...integration,
    config: {
      ...config,
      chainIds: Array.isArray(config.chainIds) ? config.chainIds : legacyChainId === null ? [] : [legacyChainId],
      routing: config.routing ?? { mode: 'fixed' },
    },
  };
}

function normalizeRule(rule: RuleGroup): RuleGroup {
  if (Array.isArray(rule.conditions)) return rule;
  const legacy = rule as RuleGroup & Partial<RuleGroup['conditions'][number]>;
  return {
    ...rule,
    combinator: rule.combinator ?? 'and',
    conditions: legacy.metric ? [{
      metric: legacy.metric,
      labels: legacy.labels ?? {},
      operator: legacy.operator ?? 'gte',
      threshold: legacy.threshold ?? '0',
      ...(legacy.windowSeconds === undefined ? {} : { windowSeconds: legacy.windowSeconds }),
      hysteresis: legacy.hysteresis ?? '0',
    }] : [],
  };
}

export function useIntegrationCatalog() {
  return useQuery({
    queryKey: cryptoSentryKeys.catalog,
    queryFn: async () => normalizeCatalog(await cryptoSentryRequest<IntegrationCatalog>('integrations/catalog')),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useIntegrationReadiness() {
  return useQuery({
    queryKey: cryptoSentryKeys.readiness,
    queryFn: () => cryptoSentryRequest<IntegrationReadiness>('integrations/readiness'),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

function isEvmRpc(integration: CryptoSentryIntegration): integration is EvmRpcIntegration {
  return integration.type === 'evm_rpc';
}

export function useIntegrations() {
  return useQuery({
    queryKey: cryptoSentryKeys.integrations,
    queryFn: async () => {
      const data = await cryptoSentryRequest<IntegrationListResponse>('integrations');
      return { items: data.items.map(normalizeIntegration) };
    },
    staleTime: 5_000,
  });
}

export function useEvmRpcIntegrations() {
  return useQuery({
    queryKey: cryptoSentryKeys.integrations,
    queryFn: async () => {
      const data = await cryptoSentryRequest<IntegrationListResponse>('integrations');
      return { items: data.items.map(normalizeIntegration) };
    },
    select: (data) => data.items.filter(isEvmRpc),
    staleTime: 5_000,
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: cryptoSentryKeys.system,
    queryFn: () => cryptoSentryRequest<SystemStatusSummary>('status/summary'),
    refetchInterval: 10_000,
  });
}

export function useRuntimeMonitorStatuses() {
  return useQuery({
    queryKey: cryptoSentryKeys.runtimeMonitors,
    queryFn: () => cryptoSentryRequest<RuntimeMonitorStatusResponse>('status/monitors'),
    refetchInterval: 10_000,
  });
}

export function useMonitors() {
  return useQuery({
    queryKey: cryptoSentryKeys.monitors,
    queryFn: () => cryptoSentryRequest<MonitorListResponse>('monitors'),
    select: (data) => data.items,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

async function readMonitorSnapshot(monitor: CryptoSentryMonitor): Promise<MonitorSnapshot> {
  if (monitor.type !== 'aave_position' && monitor.type !== 'lp_position') {
    return cryptoSentryRequest<MonitorSnapshot>(`monitors/${encodeURIComponent(monitor.id)}/snapshot`);
  }
  const legacyPath = monitor.type === 'aave_position'
    ? 'positions'
    : monitor.config.walletAddress ? 'uniswap-positions' : 'uniswap-position';
  const legacy = await cryptoSentryRequest<Record<string, unknown>>(
    `monitors/${encodeURIComponent(monitor.id)}/${legacyPath}`,
  );
  return {
    monitorId: monitor.id,
    monitorType: monitor.type,
    status: (legacy.status as MonitorSnapshot['status'] | undefined) ?? monitor.lastStatus,
    observedAt: typeof legacy.observedAt === 'string' ? legacy.observedAt : monitor.lastDataAt,
    dataAgeSeconds: typeof legacy.dataAgeSeconds === 'number' ? legacy.dataAgeSeconds : null,
    maxStaleSeconds: monitor.maxStaleSeconds,
    capability: { available: true, reason: null },
    summary: typeof legacy.summary === 'object' && legacy.summary !== null ? legacy.summary as Record<string, unknown> : {},
    data: {
      positions: legacy.positions ?? [],
      networkScans: legacy.networkScans ?? [],
      discovery: legacy.discovery ?? null,
    },
    error: typeof legacy.error === 'object' ? legacy.error as MonitorSnapshot['error'] : null,
  };
}

export function useMonitorSnapshot(monitor: CryptoSentryMonitor | null) {
  return useQuery({
    queryKey: cryptoSentryKeys.snapshot(monitor?.id ?? ''),
    queryFn: () => monitor === null
      ? Promise.reject(new Error('尚未选择 Monitor'))
      : readMonitorSnapshot(monitor),
    enabled: monitor !== null,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });
}

function invalidateMonitoring(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.monitors }),
    queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.rules }),
    queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.readiness }),
  ]);
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MonitorCreateInput) => cryptoSentryRequest<CryptoSentryMonitor>('monitors', {
      method: 'POST', body: JSON.stringify(input),
    }),
    onSuccess: (monitor) => {
      queryClient.setQueryData<MonitorListResponse>(cryptoSentryKeys.monitors, (current) => ({
        items: [...(current?.items ?? []), monitor],
      }));
    },
    onSettled: () => invalidateMonitoring(queryClient),
  });
}

export function useUpdateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MonitorUpdateInput }) =>
      cryptoSentryRequest<CryptoSentryMonitor>(`monitors/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      }),
    onSuccess: (monitor) => {
      queryClient.setQueryData<MonitorListResponse>(cryptoSentryKeys.monitors, (current) => ({
        items: (current?.items ?? []).map((item) => item.id === monitor.id ? monitor : item),
      }));
    },
    onSettled: (_data, _error, variables) => Promise.all([
      invalidateMonitoring(queryClient),
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.snapshot(variables.id) }),
    ]),
  });
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cryptoSentryRequest<void>(`monitors/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => invalidateMonitoring(queryClient),
  });
}

export function useRules() {
  return useQuery({
    queryKey: cryptoSentryKeys.rules,
    queryFn: async () => {
      const data = await cryptoSentryRequest<RuleListResponse>('rules');
      return { items: data.items.map(normalizeRule) };
    },
    select: (data) => data.items,
    staleTime: 5_000,
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RuleCreateInput) => cryptoSentryRequest<RuleGroup>('rules', {
      method: 'POST', body: JSON.stringify(input),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.rules }),
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RuleCreateInput> }) =>
      cryptoSentryRequest<RuleGroup>(`rules/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.rules }),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cryptoSentryRequest<void>(`rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.rules }),
  });
}

export function useAlerts(status: AlertStatus | 'all') {
  const query = new URLSearchParams({ limit: '50', offset: '0' });
  if (status !== 'all') query.set('status', status);
  return useQuery({
    queryKey: cryptoSentryKeys.alerts(status),
    queryFn: () => cryptoSentryRequest<AlertListResponse>(`alerts?${query}`),
    staleTime: 3_000,
    refetchInterval: 10_000,
  });
}

export function useAlertAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'acknowledge' | 'resolve' }) =>
      cryptoSentryRequest<CryptoSentryAlert>(`alerts/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crypto-sentry', 'alerts'] }),
  });
}

export function useConfigureBinance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<BinanceSetupResult> => {
      const ensured = await cryptoSentryRequest<{ created: boolean; integration: CryptoSentryIntegration }>(
        'integrations/binance/default', { method: 'POST' },
      );
      const id = encodeURIComponent(ensured.integration.id);
      const [test, markets] = await Promise.all([
        cryptoSentryRequest<IntegrationTestResult>(`integrations/${id}/test`, { method: 'POST' }),
        cryptoSentryRequest<MarketSyncResult>(`integrations/${id}/sync-markets`, { method: 'POST' }),
      ]);
      return { ...ensured, test, markets };
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.integrations }),
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.readiness }),
    ]),
  });
}

export function useCreateAndTestRpcIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RpcIntegrationInput): Promise<RpcSetupResult> => {
      const integration = await cryptoSentryRequest<CryptoSentryIntegration>('integrations', {
        method: 'POST',
        body: JSON.stringify({ name: input.name, type: 'evm_rpc', provider: input.provider, enabled: true, config: {
          rpcUrl: input.rpcUrl, chainIds: input.chainIds, routing: input.routing,
          ...(input.headers === undefined || input.headers === null ? {} : { headers: input.headers }),
          timeoutMilliseconds: input.timeoutMilliseconds,
          multicallBatchSizeBytes: input.multicallBatchSizeBytes,
        } }),
      });
      const test = await cryptoSentryRequest<IntegrationTestResult>(
        `integrations/${encodeURIComponent(integration.id)}/test`, { method: 'POST' },
      );
      return { integration, test };
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.integrations }),
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.readiness }),
    ]),
  });
}

export function useUpdateAndTestRpcIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RpcIntegrationUpdateInput): Promise<RpcSetupResult> => {
      const integration = await cryptoSentryRequest<CryptoSentryIntegration>(
        `integrations/${encodeURIComponent(input.id)}`,
        { method: 'PATCH', body: JSON.stringify({ name: input.name, config: {
          rpcUrl: input.rpcUrl, chainIds: input.chainIds, routing: input.routing,
          headers: input.headers,
          timeoutMilliseconds: input.timeoutMilliseconds,
          multicallBatchSizeBytes: input.multicallBatchSizeBytes,
        } }) },
      );
      const test = await cryptoSentryRequest<IntegrationTestResult>(
        `integrations/${encodeURIComponent(input.id)}/test`, { method: 'POST' },
      );
      return { integration, test };
    },
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.integrations }),
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.readiness }),
    ]),
  });
}

export function useTestIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cryptoSentryRequest<IntegrationTestResult>(
      `integrations/${encodeURIComponent(id)}/test`, { method: 'POST' },
    ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.readiness }),
  });
}

export function useSetIntegrationEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      cryptoSentryRequest<CryptoSentryIntegration>(`integrations/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ enabled }),
      }),
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.integrations }),
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.readiness }),
    ]),
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cryptoSentryRequest<void>(`integrations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.integrations }),
      queryClient.invalidateQueries({ queryKey: cryptoSentryKeys.readiness }),
    ]),
  });
}

export function useBinanceMarkets(integrationId: string | null) {
  return useQuery({
    queryKey: cryptoSentryKeys.markets(integrationId ?? ''),
    queryFn: () => cryptoSentryRequest<BinanceMarketListResponse>(
      `integrations/${encodeURIComponent(integrationId ?? '')}/markets`,
    ),
    enabled: integrationId !== null,
    staleTime: 60_000,
  });
}

export function useAaveReserves(integrationId: string | null, chainId = 1) {
  return useQuery({
    queryKey: cryptoSentryKeys.reserves(integrationId ?? '', chainId),
    queryFn: () => cryptoSentryRequest<AaveReserveCatalog>(
      `integrations/${encodeURIComponent(integrationId ?? '')}/aave/reserves?chainId=${chainId}`,
    ),
    enabled: integrationId !== null,
    staleTime: 60_000,
  });
}

export function useUniswapPools(
  integrationId: string | null,
  chainId: number,
  version: UniswapVersion,
  q: string,
) {
  const query = new URLSearchParams({ chainId: String(chainId), version, limit: '50' });
  if (q.trim()) query.set('q', q.trim());
  return useQuery({
    queryKey: cryptoSentryKeys.pools(integrationId ?? '', chainId, version, q),
    queryFn: () => cryptoSentryRequest<UniswapPoolCatalogResponse>(
      `integrations/${encodeURIComponent(integrationId ?? '')}/uniswap/pools?${query}`,
    ),
    enabled: integrationId !== null,
    staleTime: 20_000,
  });
}

export function useUniswapWalletPositions(
  integrationId: string | null,
  chainId: number,
  version: UniswapVersion,
  walletAddress: string,
  q: string,
  enabled: boolean,
) {
  const query = new URLSearchParams({ chainId: String(chainId), version, walletAddress, limit: '50' });
  if (q.trim()) query.set('q', q.trim());
  return useQuery({
    queryKey: cryptoSentryKeys.walletPositions(integrationId ?? '', chainId, version, walletAddress, q),
    queryFn: () => cryptoSentryRequest<UniswapWalletPositionsResponse>(
      `integrations/${encodeURIComponent(integrationId ?? '')}/uniswap/wallet-positions?${query}`,
    ),
    enabled: integrationId !== null && enabled,
    staleTime: 10_000,
  });
}
