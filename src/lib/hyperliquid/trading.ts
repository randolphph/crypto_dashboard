import { privateKeyToAccount } from 'viem/accounts';
import Decimal from 'decimal.js';
import { formatPrice, formatSize } from '@nktkas/hyperliquid/utils';
import { multiplyDecimalDown } from '@/lib/hyperliquid/decimal';
import type {
  HyperliquidMonitorEvent,
  HyperliquidNetwork,
  HyperliquidOrder,
  HyperliquidPosition,
} from '@/types/hyperliquid';

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/;
const COPY_CLOID_PREFIX = '636f707974726164'; // "copytrad", followed by the source oid as uint64.

export interface HyperliquidMarket {
  assetId: number;
  coin: string;
  sizeDecimals: number;
}

export interface FollowerOrderMapping {
  sourceOid: string;
  followerOid: string;
  assetId: number;
  coin: string;
}

export type CopyPreviewDecision = 'position' | 'place' | 'cancel' | 'skip';

export interface CopyPreviewItem {
  id: string;
  decision: CopyPreviewDecision;
  sourceEventIds: string[];
  sourceOid: string;
  followerOid: string | null;
  coin: string;
  assetId: number | null;
  side: HyperliquidOrder['side'] | null;
  price: string | null;
  sourceSize: string | null;
  copiedSize: string | null;
  reduceOnly: boolean;
  tif: 'Gtc' | 'Alo' | 'Ioc' | null;
  cloid: `0x${string}` | null;
  followerSize: string | null;
  targetSize: string | null;
  reason: string;
}

export interface CopyPreview {
  id: string;
  createdAt: number;
  expiresAt: number;
  targetAddress: string;
  network: HyperliquidNetwork;
  ratio: string;
  maxSlippagePercent: string;
  signerAddress: string;
  items: CopyPreviewItem[];
}

export interface CopyExecutionResult {
  itemId: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  mapping?: FollowerOrderMapping;
  removeSourceOid?: string;
}

function normalizePrivateKey(value: string): `0x${string}` {
  const trimmed = value.trim();
  if (!PRIVATE_KEY_PATTERN.test(trimmed)) throw new Error('API Wallet 私钥格式不正确');
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as `0x${string}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Hyperliquid 拒绝了本次请求';
}

function normalizeLimitTif(order: HyperliquidOrder): 'Gtc' | 'Alo' | null {
  const value = `${order.tif ?? ''} ${order.orderType}`.toLowerCase();
  if (value.includes('alo') || value.includes('post only')) return 'Alo';
  if (value.includes('ioc') || value.includes('market')) return null;
  return 'Gtc';
}

function sourceOidToCloid(sourceOid: string): `0x${string}` {
  if (!/^\d+$/.test(sourceOid)) throw new Error('目标订单编号格式不正确');
  const value = BigInt(sourceOid);
  const max = (BigInt(1) << BigInt(64)) - BigInt(1);
  if (value > max) throw new Error('目标订单编号超出可映射范围');
  return `0x${COPY_CLOID_PREFIX}${value.toString(16).padStart(16, '0')}`;
}

function cloidToSourceOid(cloid: string | null) {
  if (!cloid || !new RegExp(`^0x${COPY_CLOID_PREFIX}[0-9a-fA-F]{16}$`).test(cloid)) return null;
  return BigInt(`0x${cloid.slice(-16)}`).toString();
}

function positionByCoin(positions: HyperliquidPosition[]) {
  return new Map(positions.map((position) => [position.coin, position]));
}

function isReducingPosition(currentSize: string, targetSize: string) {
  const current = new Decimal(currentSize);
  const target = new Decimal(targetSize);
  if (current.isZero()) return false;
  if (target.isZero()) return true;
  return current.isPositive() === target.isPositive() && target.abs().lt(current.abs());
}

export async function prepareHyperliquidTrading(
  accountAddress: string,
  apiWalletPrivateKey: string,
  network: HyperliquidNetwork,
) {
  if (!ADDRESS_PATTERN.test(accountAddress.trim())) throw new Error('请先在设置中填写正确的 Hyperliquid 主账户地址');
  const wallet = privateKeyToAccount(normalizePrivateKey(apiWalletPrivateKey));
  const { HttpTransport, InfoClient } = await import('@nktkas/hyperliquid');
  const transport = new HttpTransport({ isTestnet: network === 'testnet', timeout: 12_000 });
  const info = new InfoClient({ transport });
  const [role, metadata, mids] = await Promise.all([
    info.userRole({ user: wallet.address }),
    info.meta(),
    info.allMids(),
  ]);
  if (role.role !== 'agent') {
    throw new Error('该私钥不是已授权的 API Wallet；请勿填写主钱包私钥');
  }
  if (role.data.user.toLowerCase() !== accountAddress.trim().toLowerCase()) {
    throw new Error('API Wallet 不属于当前填写的主账户');
  }
  const markets = new Map<string, HyperliquidMarket>();
  metadata.universe.forEach((market, assetId) => {
    if (!market.isDelisted) markets.set(market.name, { assetId, coin: market.name, sizeDecimals: market.szDecimals });
  });
  return { signerAddress: wallet.address, markets, mids };
}

export function buildCopyPreview(params: {
  events: HyperliquidMonitorEvent[];
  handledEventIds: ReadonlySet<string>;
  currentOrders: HyperliquidOrder[];
  leaderPositions: HyperliquidPosition[];
  followerPositions: HyperliquidPosition[];
  followerOrders: HyperliquidOrder[];
  trackedPositionCoins: ReadonlySet<string>;
  mappings: ReadonlyMap<string, FollowerOrderMapping>;
  markets: ReadonlyMap<string, HyperliquidMarket>;
  mids: Readonly<Record<string, string>>;
  ratio: string;
  maxSlippagePercent: string;
  targetAddress: string;
  network: HyperliquidNetwork;
  signerAddress: string;
}): CopyPreview {
  const ratio = new Decimal(params.ratio);
  const slippage = new Decimal(params.maxSlippagePercent);
  if (!ratio.isFinite() || !ratio.gt(0)) throw new Error('跟单比例必须大于 0');
  if (!slippage.isFinite() || slippage.isNegative() || slippage.gt(5)) throw new Error('最大滑点必须在 0% 到 5% 之间');
  const pending = params.events.filter((event) =>
    event.sourceOid &&
    !params.handledEventIds.has(event.id) &&
    (event.kind === 'order_appeared' || event.kind === 'order_changed' || event.kind === 'order_disappeared'),
  );
  const current = new Map(params.currentOrders.map((order) => [order.oid, order]));
  const effectiveMappings = new Map(params.mappings);
  for (const order of params.followerOrders) {
    const sourceOid = cloidToSourceOid(order.cloid);
    const market = params.markets.get(order.coin);
    if (sourceOid && market) {
      effectiveMappings.set(sourceOid, {
        sourceOid,
        followerOid: order.oid,
        assetId: market.assetId,
        coin: order.coin,
      });
    }
  }
  const eventIdsByOid = new Map<string, string[]>();
  for (const event of pending) {
    const oid = event.sourceOid!;
    eventIdsByOid.set(oid, [...(eventIdsByOid.get(oid) ?? []), event.id]);
  }

  const items: CopyPreviewItem[] = [];
  const followerPositions = positionByCoin(params.followerPositions);
  const leaderPositions = positionByCoin(params.leaderPositions);
  const positionCoins = new Set([...leaderPositions.keys(), ...params.trackedPositionCoins]);
  for (const coin of positionCoins) {
    const leader = leaderPositions.get(coin);
    const market = params.markets.get(coin);
    const followerSize = followerPositions.get(coin)?.size ?? '0';
    let targetSize: string | null = null;
    let copiedSize: string | null = null;
    let side: HyperliquidOrder['side'] | null = null;
    let price: string | null = null;
    let decision: CopyPreviewDecision = 'position';
    let reason = leader ? '将跟单账户调整到按比例计算的目标仓位' : '目标仓位已关闭，平掉本次会话曾复刻的对应仓位';
    if (!market) {
      decision = 'skip';
      reason = '该合约不在当前网络的标准永续市场中';
    } else {
      targetSize = leader
        ? new Decimal(leader.size).mul(ratio).toDecimalPlaces(market.sizeDecimals, Decimal.ROUND_DOWN).toFixed()
        : '0';
      const delta = new Decimal(targetSize).minus(followerSize).toDecimalPlaces(market.sizeDecimals, Decimal.ROUND_DOWN);
      if (leader && new Decimal(targetSize).isZero()) {
        decision = 'skip';
        reason = '按比例取整后的目标仓位为 0，不调整跟单账户';
      } else if (delta.isZero()) {
        decision = 'skip';
        reason = '跟单账户已经达到目标比例仓位';
      } else if (!params.mids[coin]) {
        decision = 'skip';
        reason = '当前无法取得该合约中间价';
      } else {
        side = delta.isPositive() ? 'buy' : 'sell';
        copiedSize = formatSize(delta.abs().toFixed(), market.sizeDecimals);
        const factor = side === 'buy'
          ? new Decimal(1).plus(slippage.div(100))
          : new Decimal(1).minus(slippage.div(100));
        price = formatPrice(new Decimal(params.mids[coin]).mul(factor).toFixed(), market.sizeDecimals);
      }
    }
    items.push({
      id: `position-${coin}`,
      decision,
      sourceEventIds: [],
      sourceOid: `position:${coin}`,
      followerOid: null,
      coin,
      assetId: market?.assetId ?? null,
      side,
      price,
      sourceSize: leader?.size ?? '0',
      copiedSize,
      reduceOnly: targetSize ? isReducingPosition(followerSize, targetSize) : false,
      tif: decision === 'position' ? 'Ioc' : null,
      cloid: null,
      followerSize,
      targetSize,
      reason,
    });
  }

  const allSourceOids = new Set([
    ...eventIdsByOid.keys(),
    ...current.keys(),
    ...effectiveMappings.keys(),
  ]);
  for (const sourceOid of allSourceOids) {
    const sourceEventIds = eventIdsByOid.get(sourceOid) ?? [];
    const order = current.get(sourceOid);
    const mapping = effectiveMappings.get(sourceOid);
    if (mapping && !order) {
      items.push({
        id: `cancel-${sourceOid}`,
        decision: 'cancel',
        sourceEventIds,
        sourceOid,
        followerOid: mapping.followerOid,
        coin: mapping.coin,
        assetId: mapping.assetId,
        side: null,
        price: null,
        sourceSize: null,
        copiedSize: null,
        reduceOnly: false,
        tif: null,
        cloid: null,
        followerSize: null,
        targetSize: null,
        reason: '目标挂单已结束，撤销对应跟单挂单',
      });
      continue;
    }
    if (mapping && order) {
      items.push({
        id: `skip-mapped-${sourceOid}`,
        decision: 'skip',
        sourceEventIds,
        sourceOid,
        followerOid: mapping.followerOid,
        coin: order.coin,
        assetId: mapping.assetId,
        side: order.side,
        price: order.price,
        sourceSize: order.remainingSize,
        copiedSize: null,
        reduceOnly: order.reduceOnly,
        tif: null,
        cloid: order.cloid,
        followerSize: null,
        targetSize: null,
        reason: '该挂单已复制；首版不自动追随数量修改',
      });
      continue;
    }
    if (!order) {
      const original = pending.find((event) => event.sourceOid === sourceOid)?.before;
      items.push({
        id: `skip-ended-${sourceOid}`,
        decision: 'skip',
        sourceEventIds,
        sourceOid,
        followerOid: null,
        coin: original && 'coin' in original ? original.coin : '未知',
        assetId: null,
        side: null,
        price: null,
        sourceSize: null,
        copiedSize: null,
        reduceOnly: false,
        tif: null,
        cloid: null,
        followerSize: null,
        targetSize: null,
        reason: '目标挂单在生成预览前已经结束，不再复制',
      });
      continue;
    }
    const market = params.markets.get(order.coin);
    const tif = normalizeLimitTif(order);
    let reason = '按当前比例复制目标限价挂单';
    let copiedSize: string | null = null;
    if (!market) reason = '该合约不在当前网络的标准永续市场中';
    else if (order.isTrigger || order.isPositionTpsl) reason = '首版不复制条件单或仓位止盈止损单';
    else if (!tif) reason = '首版不复制市价或 IOC 订单';
    else {
      copiedSize = multiplyDecimalDown(order.remainingSize, params.ratio, market.sizeDecimals);
      if (copiedSize === '0') reason = `按比例取整后小于 ${market.sizeDecimals} 位数量精度`;
    }
    const decision: CopyPreviewDecision = market && tif && copiedSize !== '0' ? 'place' : 'skip';
    items.push({
      id: `${decision}-${sourceOid}`,
      decision,
      sourceEventIds,
      sourceOid,
      followerOid: null,
      coin: order.coin,
      assetId: market?.assetId ?? null,
      side: order.side,
      price: order.price,
      sourceSize: order.remainingSize,
      copiedSize,
      reduceOnly: order.reduceOnly,
      tif,
      cloid: decision === 'place' ? sourceOidToCloid(sourceOid) : null,
      followerSize: null,
      targetSize: null,
      reason,
    });
  }

  const now = Date.now();
  return {
    id: `${now}-${params.targetAddress.toLowerCase()}`,
    createdAt: now,
    expiresAt: now + 60_000,
    targetAddress: params.targetAddress.toLowerCase(),
    network: params.network,
    ratio: params.ratio,
    maxSlippagePercent: params.maxSlippagePercent,
    signerAddress: params.signerAddress,
    items,
  };
}

export async function executeCopyPreview(
  preview: CopyPreview,
  apiWalletPrivateKey: string,
): Promise<CopyExecutionResult[]> {
  if (Date.now() > preview.expiresAt) throw new Error('预览已超过 60 秒，请重新生成');
  const wallet = privateKeyToAccount(normalizePrivateKey(apiWalletPrivateKey));
  if (wallet.address.toLowerCase() !== preview.signerAddress.toLowerCase()) {
    throw new Error('API Wallet 已变化，请重新生成预览');
  }
  const { ExchangeClient, HttpTransport } = await import('@nktkas/hyperliquid');
  const transport = new HttpTransport({ isTestnet: preview.network === 'testnet', timeout: 12_000 });
  const exchange = new ExchangeClient({
    transport,
    wallet,
    defaultExpiresAfter: () => Date.now() + 30_000,
  });
  const results: CopyExecutionResult[] = [];

  for (const item of preview.items) {
    if (item.decision === 'skip') {
      results.push({ itemId: item.id, status: 'skipped', message: item.reason });
      continue;
    }
    try {
      if (item.decision === 'place' || item.decision === 'position') {
        if (item.assetId === null || !item.side || !item.price || !item.copiedSize || !item.tif) {
          throw new Error('预览中的下单参数不完整');
        }
        const response = await exchange.order({
          orders: [{
            a: item.assetId,
            b: item.side === 'buy',
            p: item.price,
            s: item.copiedSize,
            r: item.reduceOnly,
            t: { limit: { tif: item.tif } },
            ...(item.cloid ? { c: item.cloid } : {}),
          }],
          grouping: 'na',
        });
        const status = response.response.data.statuses[0];
        if (item.decision === 'position' && typeof status === 'object' && 'filled' in status) {
          results.push({ itemId: item.id, status: 'success', message: `仓位已成交 ${status.filled.totalSz} ${item.coin}` });
        } else if (item.decision === 'position') {
          throw new Error('仓位差额单未成交，请重新生成预览');
        } else if (typeof status === 'object' && 'resting' in status) {
          const mapping: FollowerOrderMapping = {
            sourceOid: item.sourceOid,
            followerOid: String(status.resting.oid),
            assetId: item.assetId,
            coin: item.coin,
          };
          results.push({ itemId: item.id, status: 'success', message: `挂单已提交 #${mapping.followerOid}`, mapping });
        } else if (typeof status === 'object' && 'filled' in status) {
          results.push({ itemId: item.id, status: 'success', message: `订单已立即成交 ${status.filled.totalSz}` });
        } else {
          throw new Error('订单状态暂不可确认');
        }
      } else {
        if (item.assetId === null || !item.followerOid) throw new Error('预览中的撤单参数不完整');
        const followerOid = Number(item.followerOid);
        if (!Number.isSafeInteger(followerOid)) throw new Error('跟单订单编号无效');
        await exchange.cancel({ cancels: [{ a: item.assetId, o: followerOid }] });
        results.push({ itemId: item.id, status: 'success', message: '跟单挂单已撤销', removeSourceOid: item.sourceOid });
      }
    } catch (error) {
      results.push({ itemId: item.id, status: 'failed', message: errorMessage(error) });
    }
  }
  return results;
}
