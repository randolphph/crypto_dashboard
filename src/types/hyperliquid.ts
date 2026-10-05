export type HyperliquidNetwork = 'mainnet' | 'testnet';

export interface HyperliquidPosition {
  coin: string;
  size: string;
  entryPrice: string | null;
  positionValue: string;
  unrealizedPnl: string;
  marginUsed: string;
  leverage: string;
  marginMode: string;
  liquidationPrice: string | null;
}

export interface HyperliquidOrder {
  oid: string;
  cloid: `0x${string}` | null;
  coin: string;
  side: 'buy' | 'sell';
  price: string;
  remainingSize: string;
  originalSize: string;
  reduceOnly: boolean;
  orderType: string;
  tif: string | null;
  isTrigger: boolean;
  isPositionTpsl: boolean;
  triggerPrice: string | null;
  triggerCondition: string | null;
  timestampMs: number;
}

export interface HyperliquidSnapshot {
  address: string;
  network: HyperliquidNetwork;
  fetchedAt: number;
  exchangeTimeMs: number;
  accountValue: string;
  totalMarginUsed: string;
  withdrawable: string;
  positions: HyperliquidPosition[];
  orders: HyperliquidOrder[];
}

export type HyperliquidMonitorEventKind =
  | 'position_opened'
  | 'position_closed'
  | 'position_increased'
  | 'position_reduced'
  | 'position_reversed'
  | 'position_settings_changed'
  | 'order_appeared'
  | 'order_changed'
  | 'order_disappeared';

export interface HyperliquidMonitorEvent {
  id: string;
  observedAt: number;
  kind: HyperliquidMonitorEventKind;
  coin: string;
  sourceOid: string | null;
  before: HyperliquidPosition | HyperliquidOrder | null;
  after: HyperliquidPosition | HyperliquidOrder | null;
}
