import type {
  HyperliquidNetwork,
  HyperliquidOrder,
  HyperliquidPosition,
  HyperliquidSnapshot,
} from '@/types/hyperliquid';

const ENDPOINTS: Record<HyperliquidNetwork, string> = {
  mainnet: 'https://api.hyperliquid.xyz/info',
  testnet: 'https://api.hyperliquid-testnet.xyz/info',
};

interface ClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
  };
  withdrawable: string;
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string | null;
      positionValue: string;
      unrealizedPnl: string;
      marginUsed: string;
      liquidationPx: string | null;
      leverage: { type: string; value: number | string };
    };
  }>;
  time: number;
}

interface FrontendOpenOrder {
  cloid?: string | null;
  coin: string;
  isPositionTpsl: boolean;
  isTrigger: boolean;
  limitPx: string;
  oid: number | string;
  orderType: string;
  origSz: string;
  reduceOnly: boolean;
  side: 'A' | 'B';
  sz: string;
  timestamp: number;
  tif?: string | null;
  triggerCondition: string;
  triggerPx: string;
}

export async function hyperliquidInfoRequest<T>(
  network: HyperliquidNetwork,
  body: Record<string, string>,
): Promise<T> {
  const response = await fetch(ENDPOINTS[network], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Hyperliquid 查询失败（HTTP ${response.status}）`);
  }
  return response.json() as Promise<T>;
}

function mapPosition(item: ClearinghouseState['assetPositions'][number]): HyperliquidPosition {
  const position = item.position;
  return {
    coin: position.coin,
    size: position.szi,
    entryPrice: position.entryPx,
    positionValue: position.positionValue,
    unrealizedPnl: position.unrealizedPnl,
    marginUsed: position.marginUsed,
    leverage: String(position.leverage.value),
    marginMode: position.leverage.type,
    liquidationPrice: position.liquidationPx,
  };
}

function mapOrder(order: FrontendOpenOrder): HyperliquidOrder {
  return {
    oid: String(order.oid),
    cloid: typeof order.cloid === 'string' && /^0x[0-9a-fA-F]{32}$/.test(order.cloid)
      ? order.cloid as `0x${string}`
      : null,
    coin: order.coin,
    side: order.side === 'B' ? 'buy' : 'sell',
    price: order.limitPx,
    remainingSize: order.sz,
    originalSize: order.origSz,
    reduceOnly: order.reduceOnly,
    orderType: order.orderType,
    tif: order.tif ?? null,
    isTrigger: order.isTrigger,
    isPositionTpsl: order.isPositionTpsl,
    triggerPrice: order.isTrigger && order.triggerPx !== '0' ? order.triggerPx : null,
    triggerCondition: order.triggerCondition === 'N/A' ? null : order.triggerCondition,
    timestampMs: order.timestamp,
  };
}

export async function fetchHyperliquidSnapshot(
  address: string,
  network: HyperliquidNetwork,
): Promise<HyperliquidSnapshot> {
  const user = address.toLowerCase();
  const [state, orders] = await Promise.all([
    hyperliquidInfoRequest<ClearinghouseState>(network, { type: 'clearinghouseState', user }),
    hyperliquidInfoRequest<FrontendOpenOrder[]>(network, { type: 'frontendOpenOrders', user }),
  ]);

  if (!state.marginSummary || !Array.isArray(state.assetPositions) || !Array.isArray(orders)) {
    throw new Error('Hyperliquid 返回了无法识别的数据');
  }

  return {
    address: user,
    network,
    fetchedAt: Date.now(),
    exchangeTimeMs: state.time,
    accountValue: state.marginSummary.accountValue,
    totalMarginUsed: state.marginSummary.totalMarginUsed,
    withdrawable: state.withdrawable,
    positions: state.assetPositions.map(mapPosition),
    orders: orders.map(mapOrder),
  };
}
