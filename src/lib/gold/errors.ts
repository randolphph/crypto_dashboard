export type GoldSourceFailure = {
  source: '新浪' | '上金所';
  reason: '限流（HTTP 429）' | '连接超时' | '网络连接失败' | '行情时间异常' | '报价无效或过期' | '服务暂不可用';
  status?: number;
};

// Only controlled diagnostics cross the API boundary; never expose upstream bodies.
export class GoldQuoteUnavailable extends Error {
  constructor(public readonly failures: GoldSourceFailure[]) {
    super(`黄金行情暂不可用：${failures.map(f => `${f.source}${f.reason}`).join('；')}`);
    this.name = 'GoldQuoteUnavailable';
  }
}
