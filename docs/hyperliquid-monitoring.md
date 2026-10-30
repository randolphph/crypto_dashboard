# Hyperliquid 地址活动监控

监控中心选择「Hyperliquid 地址」，填写实际账户或子账户地址，可选择主网或测试网。直接使用官方公开接口，不需要 API Key、私钥、Alchemy 或其他 EVM RPC。当前功能监控交易所活动，不是 HyperEVM 通用转账监听。

创建任务后，在「告警规则」中选择「地址活动 = 是」，可限定成交、挂单、撤单、订单拒绝或条件单触发，也可通过高级选项按 `coin`、`side`、`marketType` 等标签过滤。默认提醒间隔为 0，每条不同活动独立处理；绑定 Telegram 或 Bark 才会向设备投递，否则只保留站内告警。页面不要求用户设置采样频率。

## 采集与恢复

- CryptoSentry 后台使用 `userFills` 和 `orderUpdates` WebSocket。成交按 `tid`/订单去重，部分成交保留为独立成交；订单完成状态不会重复生成一条成交。
- 每个网络/账户共享一个连接；相同地址的多个任务共用采集。因为 `orderUpdates` 消息不携带账户地址，不把多个地址混进同一连接。
- 首次创建只接收本次监控开始后的活动；订阅快照和历史核对中的旧活动不触发告警。
- 会话、恢复游标和活动先持久化，再进入已有的 Metric / Rule / Alert / Telegram / Bark 链路。处理失败的事件保留重试，后端重启保留断点。
- 断线重连延续原会话，并补查成交和订单最终状态。暂停后重新启用或修改监控地址/网络会开启新会话、清空活动列表；旧告警记录保留。改名或修改普通设置不重置会话。
- 定期历史核对约每 5 分钟一次；正常运行靠推送，不按每个页面刷新请求官方接口。页面约每 3 秒读取本地监控快照，后台告警处理独立于页面刷新，关闭网页仍继续。
- 官方历史订单最多 2000 条，成交历史也有返回和保留范围限制。达到恢复边界会显示历史缺口；断线期间短暂挂单、改单的中间过程不能保证完整还原，不从“订单消失”猜测撤单。
- 当前快照最多展示最近 50 条活动。已处理活动保留 30 天，未处理事件等待重试；删除任务时级联清理。
- 后端使用 20 秒心跳、订阅/连接超时、重连退避、每分钟最多 25 次新连接及共享 REST 加权预算，并遵守 429 的重试间隔。服务内最多同时订阅 10 个不同网络/地址组合；同一出口 IP 的其他应用也会占用官方限额。

## 后端部署与验收

需要同步更新 `crypto-sentry`；前端以 `/integrations/catalog` 的 `hyperliquid_account` 能力为准，旧后端会显示需要更新，不会伪装为可用。后端启动时自动应用 `0015_hyperliquid_activity` 迁移。

现有 `/api/crypto-sentry/*` 代理和服务端 Token 继续使用，浏览器不获得后端 Token。无需新增凭据类 Integration；数据源页显示官方公开接口说明。

后端显式只读主网冒烟测试：`npm run test:hyperliquid:live`。默认使用零地址，验证 REST、两个订阅确认和心跳；可附加 `-- --address 0x…` 读取指定公开地址，不发起交易或推送。这个连通测试不等同于在用户账户上实际完成成交或设备收件验收。

参考：[官方订阅](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions)、[Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)、[限流](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits)。
