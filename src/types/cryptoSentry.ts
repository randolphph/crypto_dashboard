export type MonitorStatus = 'warming_up' | 'ok' | 'stale' | 'error';
export type SnapshotStatus = MonitorStatus | 'empty' | 'partial' | 'unsupported';
export type MonitorType =
  | 'market'
  | 'aave_account'
  | 'aave_pool'
  | 'uniswap_position'
  | 'uniswap_wallet'
  | 'uniswap_pool'
  | 'aave_position'
  | 'lp_position';
export type UniswapVersion = 'v3' | 'v4';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';
export type EvmRpcProvider = 'alchemy' | 'infura' | 'quicknode' | 'custom';
export type RpcRoutingMode = 'fixed' | 'url_template' | 'header' | 'query';
export type RuleOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export interface CryptoSentryApiError {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface CryptoSentryIntegration {
  id: string;
  name: string;
  type: 'market_data' | 'evm_rpc' | 'notification';
  provider: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type EvmRpcRouting =
  | { mode: 'fixed' }
  | { mode: 'url_template'; chainIdPlaceholder?: string }
  | { mode: 'header'; headerName: string; valueTemplate?: string }
  | { mode: 'query'; parameterName: string };

export interface EvmRpcIntegrationConfig extends Record<string, unknown> {
  rpcUrl: string;
  chainIds: number[];
  routing: EvmRpcRouting;
  headers?: Record<string, string>;
  timeoutMilliseconds: number;
  multicallBatchSizeBytes: number;
}

export interface EvmRpcIntegration extends Omit<CryptoSentryIntegration, 'type' | 'config'> {
  type: 'evm_rpc';
  config: EvmRpcIntegrationConfig;
}

export interface TelegramIntegration extends Omit<CryptoSentryIntegration, 'type' | 'provider' | 'config'> {
  type: 'notification';
  provider: 'telegram';
  config: { botToken: string; chatId: string };
}

export interface TelegramIntegrationInput {
  name: string;
  chatId: string;
  botToken: string;
}

export interface TelegramIntegrationUpdateInput {
  id: string;
  name: string;
  chatId: string;
  botToken?: string;
}

export interface TelegramDiscoveredChat {
  id: string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title: string;
  username: string | null;
  lastSeenAt: string;
}

export interface TelegramDiscoveryResult {
  bot: { id: string; username: string | null; displayName: string };
  chats: TelegramDiscoveredChat[];
}

export interface IntegrationListResponse { items: CryptoSentryIntegration[] }

export interface RuleMetricDefinition {
  id: string;
  name: string;
  kind: 'gauge' | 'event';
  valueType: 'decimal' | 'boolean';
  operators: RuleOperator[];
  units: string[];
  requiresWindow: boolean;
  windowSecondsMin?: number;
  windowSecondsMax?: number;
  monitorTypes: string[];
  marketTypes?: Array<'spot' | 'perpetual'>;
  chainIds?: number[];
  versions?: UniswapVersion[];
  labels: string[];
}

export interface IntegrationCatalog {
  samplingPresets: Array<{ id: string; intervalSeconds: number }>;
  ruleMetrics: Partial<Record<MonitorType, RuleMetricDefinition[]>>;
  marketData: {
    providers: Array<{
      id: 'binance'; name: string; requiresCredentials: boolean;
      supportedMarketTypes: Array<'spot' | 'perpetual'>;
      defaultConfig: Record<string, string>;
    }>;
  };
  evmRpc: {
    providers: Array<{ id: EvmRpcProvider; name: string }>;
    routingModes: Array<{ id: RpcRoutingMode; name: string }>;
    networks: Array<{
      chainId: number; name: string; productEnabled: boolean;
      capabilities: { aaveV3: string; uniswapV3: string; uniswapV4: string };
      defaultRpcUrl?: string; explorerUrl?: string;
    }>;
    configDefaults: { timeoutMilliseconds: number; multicallBatchSizeBytes: number };
  };
  monitorTypes: Array<{
    id: MonitorType; status: 'available' | 'planned'; chainIds?: number[]; versions?: UniswapVersion[];
  }>;
  aave: { deployments: Array<{ chainId: number; chainName: string; version: 'v3' }> };
  uniswap?: {
    deployments: Array<{
      chainId: number; chainName: string; version: UniswapVersion; deploymentBlock: string; explorerUrl?: string;
    }>;
  };
}

export interface IntegrationReadiness {
  aave: {
    ready: boolean; configuredNetworkCount: number;
    networks: Array<{
      chainId: number; name: string; ready: true; integrationIds: string[];
      capabilities: { accountRead: boolean; reserveCatalog: boolean; eventLogs: boolean };
    }>;
  };
  uniswap: {
    ready: boolean; configuredNetworkCount: number;
    networks: Array<{
      chainId: number; name: string; versions: Record<UniswapVersion, boolean>; integrationIds: string[];
    }>;
  };
  binance: {
    ready: boolean;
    sources: Array<{ integrationId: string; name: string; enabled: boolean; marketCount: number }>;
  };
}

export interface IntegrationNetworkTest {
  chainId: number;
  chainName: string;
  ok: boolean;
  blockNumber: string | null;
  connectivity: Partial<Record<'rpc' | 'aaveV3' | 'uniswapV3' | 'uniswapV4', 'ok' | 'error' | 'unknown'>>;
  aaveCapabilities?: Partial<Record<'accountRead' | 'reserveCatalog' | 'eventLogs', 'ok' | 'error' | 'unknown'>>;
  capabilityErrors?: Record<string, { code: string; message: string } | null>;
  error: { code: string; message: string } | null;
}

export interface IntegrationTestResult {
  ok: boolean;
  provider: string;
  delivery?: { status: 'sent' | 'failed' };
  error?: { code: string; message: string };
  networks?: IntegrationNetworkTest[];
  connectivity?: Record<string, 'ok' | 'error' | 'unknown'>;
  chainId?: number;
  blockNumber?: string;
}

export interface MarketSyncResult { synchronizedAt: string; total: number; spot: number; perpetual: number }
export interface BinanceSetupResult {
  created: boolean; integration: CryptoSentryIntegration; test: IntegrationTestResult; markets: MarketSyncResult;
}

export interface RpcIntegrationInput {
  name: string;
  provider: EvmRpcProvider;
  rpcUrl: string;
  chainIds: number[];
  routing: EvmRpcRouting;
  headers?: Record<string, string> | null;
  timeoutMilliseconds: number;
  multicallBatchSizeBytes: number;
}
export interface RpcIntegrationUpdateInput extends RpcIntegrationInput { id: string }
export interface RpcSetupResult { integration: CryptoSentryIntegration; test: IntegrationTestResult }

export type MonitorConfig = Record<string, unknown> & {
  integrationId?: string;
  rpcIntegrationId?: string;
  chainId?: number;
  chainIds?: number[];
  version?: UniswapVersion;
  versions?: UniswapVersion[];
  walletAddress?: string;
  tokenId?: string;
  poolAddress?: string;
  poolId?: string;
  reserveAssetAddresses?: string[];
  marketType?: 'spot' | 'perpetual';
  providerSymbol?: string;
  canonicalSymbol?: string;
  priceType?: 'last' | 'mark';
};

export interface CryptoSentryMonitor {
  id: string;
  name: string;
  type: MonitorType;
  enabled: boolean;
  intervalSeconds: number;
  maxStaleSeconds: number;
  config: MonitorConfig;
  lastStatus: MonitorStatus;
  lastDataAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface MonitorListResponse { items: CryptoSentryMonitor[] }

export interface MonitorCreateInput {
  name: string;
  type: Exclude<MonitorType, 'aave_position' | 'lp_position'>;
  enabled: boolean;
  intervalSeconds: number;
  maxStaleSeconds: number;
  config: MonitorConfig;
}

export interface MonitorUpdateInput {
  name?: string;
  enabled?: boolean;
  intervalSeconds?: number;
  maxStaleSeconds?: number;
  config?: MonitorConfig;
}

export interface MonitorSnapshot {
  monitorId: string;
  monitorType: MonitorType;
  status: SnapshotStatus;
  observedAt: string | null;
  dataAgeSeconds: number | null;
  maxStaleSeconds: number;
  capability: { available: boolean; reason: string | null };
  summary: Record<string, unknown>;
  data: Record<string, unknown>;
  error: { code: string; message: string } | null;
}

export interface BinanceMarket {
  integrationId?: string;
  marketType: 'spot' | 'perpetual';
  providerSymbol: string;
  canonicalSymbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  enabled?: boolean;
}
export interface BinanceMarketListResponse { items: BinanceMarket[] }

export interface AaveReserve {
  underlyingAsset: string; symbol: string; name: string | null; decimals: number;
  active: boolean; frozen: boolean; borrowingEnabled: boolean; usageAsCollateralEnabled: boolean;
  priceUsd: string | null; priceStatus: string; metadataStatus: string;
}
export interface AaveReserveCatalog {
  chainId: number; chainName: string; status: 'ok' | 'partial' | 'error'; stale: boolean;
  items: AaveReserve[]; blockNumber: string | null; observedAt: string | null;
  error: { code: string; message: string } | null;
}

export interface UniswapPoolResource {
  chainId: number; chainName: string; version: UniswapVersion;
  poolAddress: string | null; poolId: string | null;
  token0: { address: string; symbol: string | null; decimals: number | null; native: boolean };
  token1: { address: string; symbol: string | null; decimals: number | null; native: boolean };
  feeTier: number | null; tickSpacing: number | null; hooksAddress: string | null;
}
export interface UniswapPoolCatalogResponse {
  status: 'warming_up' | 'ok' | 'empty' | 'partial' | 'error';
  discovery: { caughtUp: boolean; scannedThroughBlock: string | null; chainTipBlock: string | null; lastAttemptAt?: string | null; lastError?: string | null };
  items: UniswapPoolResource[]; nextCursor: string | null;
  error: { code: string; message: string } | null;
}

export interface UniswapWalletPositionResource {
  chainId: number; chainName: string; version: UniswapVersion; tokenId: string;
  poolAddress: string | null; poolId: string | null;
  token0: { address: string; symbol: string | null };
  token1: { address: string; symbol: string | null };
  inRange?: boolean | null;
}
export interface UniswapWalletPositionsResponse {
  status: 'warming_up' | 'ok' | 'empty' | 'partial' | 'error';
  discovery: { caughtUp: boolean; scannedThroughBlock: string | null; chainTipBlock: string | null };
  items: UniswapWalletPositionResource[]; failedPositionCount: number; nextCursor: string | null;
  error: { code: string; message: string } | null;
}

export interface RuleCondition {
  metric: string;
  labels: Record<string, string>;
  operator: RuleOperator;
  threshold: string;
  windowSeconds?: number;
  hysteresis: string;
}
export interface RuleGroup {
  id: string;
  monitorId: string;
  name: string;
  combinator: 'and' | 'or';
  conditions: RuleCondition[];
  durationSeconds: number;
  cooldownSeconds: number;
  severity: AlertSeverity;
  notificationIntegrationIds: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface RuleListResponse { items: RuleGroup[] }
export type RuleCreateInput = Omit<RuleGroup, 'id' | 'createdAt' | 'updatedAt'>;

export interface CryptoSentryAlert {
  id: string; ruleId: string | null; monitorId: string | null; status: AlertStatus;
  severity: AlertSeverity; title: string; message: string; metricName: string | null;
  currentValue: string | null; threshold: string | null; observedAt: string;
  acknowledgedAt: string | null; resolvedAt: string | null;
  delivery: {
    targets?: Array<{
      integrationId: string;
      status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
      attempts: number;
      lastAttemptAt?: string;
      nextAttemptAt?: string;
      sentAt?: string;
      errorCode?: string;
    }>;
  };
  createdAt: string; updatedAt: string;
}
export interface AlertListResponse { items: CryptoSentryAlert[]; total: number; limit: number; offset: number }

export type SystemHealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export interface RuntimeComponentHealth {
  name: string; status: 'healthy' | 'error'; lastSuccessAt: string | null;
  lastErrorAt: string | null; lastError: string | null;
}
export interface SystemStatusSummary {
  status: SystemHealthStatus; serverTime: string; startedAt: string; engineHeartbeatAt: string;
  monitors: { total: number; healthy: number; stale: number; error: number };
  alerts: { open: number; unacknowledged: number; lastAlertAt: string | null };
  components: RuntimeComponentHealth[];
  sources: Array<{ id: string; name: string; status: 'configured' | 'disabled'; lastDataAt: string | null }>;
}
export interface RuntimeMonitorStatus {
  id: string; name: string; enabled: boolean; status: MonitorStatus;
  lastDataAt: string | null; lastError: string | null;
}
export interface RuntimeMonitorStatusResponse { items: RuntimeMonitorStatus[] }
