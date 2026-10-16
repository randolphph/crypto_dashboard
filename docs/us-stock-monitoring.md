# 美股价格监控

入口：监控中心 → 添加 → 美股价格。填写股票代码、数据源、检查频率和过期阈值；创建后在「告警规则」中设置目标价格、触发方向、持续时间、冷却时间，以及 Telegram / Bark 通知目标。未选择通知目标时，仅记录站内告警。

采集与规则执行在 CryptoSentry 后端运行，关闭网页不会停止监控。前端仍通过 `/api/crypto-sentry/*` 服务端代理访问，浏览器不接触后端令牌。无需另建股票数据源 Integration。

## 数据源与时间

- `auto`：依次使用新浪 → Yahoo → 币安，遇到失败或行情过期时切换；优先使用第一个新鲜报价。币安没有对应股票合约时跳过；所有可用报价均过期则保留较新的行情，标为过期，不触发价格告警。
- `sina` / `yahoo`：USD 股价，可选包含盘前盘后行情。价格与对应的实际成交时间配对；新浪响应时钟不能代替成交时间。
- `binance`：先在 USDⓈ-M 合约目录校验 `underlyingType=EQUITY`、可交易状态及永续合约类型，再读取 `premiumIndex` 的 USDT 标记价格。也可单独指定此来源。实测目录中的股票合约使用 `TRADIFI_PERPETUAL`。

自动模式下，目标价格的同一数值按实际来源的 USD 或 USDT 比较，不进行汇率换算；币安价格是股票永续标记价格。页面快照及 Telegram / Bark 提醒会标明实际来源与价格口径。新浪 / Yahoo 的盘前盘后选项只作用于这两家；回退币安后可连续报价，包括美股休市期间。

频率可配置为 5–86400 秒，默认美股使用 60 秒检查、180 秒过期阈值。检查频率不代表数据源更新频率；休市、源数据延迟或网络失败时，不会将旧报价或错误值作为新价格触发警报。

## 后端接口

需要同步部署包含 `stock_price` 类型的 CryptoSentry；目录 `/integrations/catalog` 的 `monitorTypes` 用于前端能力识别。旧后端不会自动获得股票采集能力。

创建监控：`POST /monitors`（经代理对应 `/api/v1/monitors`）

```json
{
  "name": "NVDA 股价",
  "type": "stock_price",
  "enabled": true,
  "intervalSeconds": 60,
  "maxStaleSeconds": 180,
  "config": { "symbol": "NVDA", "provider": "auto", "includeExtended": true }
}
```

规则复用 `POST /rules`，支持 `price` 和 `data_age_seconds` 指标。价格必须大于零；`price` 默认按数据源使用 USD 或 USDT。快照 `/monitors/:id/snapshot` 返回实际来源、币种、价格口径、交易时段和原始行情时间；故障指标为 `error`，陈旧指标为 `stale`，不参与价格触发。

修改或停用任务会中止旧采集任务，丢弃配置修改前的在途结果。启停操作保留原有频率和过期设置。触发、恢复、冷却、通知目标选择和后台投递重试均复用现有规则与通知引擎。

验证使用隔离数据库和模拟通知传输，覆盖定时采集、频率修改、停用、过期/错误报价不触发、冷却及 Bark 投递；不发送真实设备消息。
