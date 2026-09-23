# Telegram 通知后端对接

前端入口：`/monitoring` →「数据源与通知」配置 Telegram 目标；在 Monitor 的「告警规则」里选择目标；「告警」列表显示投递状态。所有请求通过 Dashboard 的 `/api/crypto-sentry/*` 代理进入 CryptoSentry `/api/v1/*`。

新增目标时，用户只需输入 Bot Token。前端调用发现接口验证 Bot，并列出最近与 Bot 交互的用户、群组或频道；用户选择目标后再通过通用 Integration 接口保存 Token 与 Chat ID。Webhook 已启用或目标不在最近 Updates 中时，仍可展开手工 Chat ID 输入。

## 已有接口，前端已接入

| 用途 | 请求 | 请求或响应约定 |
|---|---|---|
| 自动发现目标 | `POST /api/v1/integrations/telegram/discover` | 请求 `{ "botToken": "..." }`；响应 `bot` 与最多 20 个 `chats`，Chat ID 为字符串；空数组时提示用户发送 `/start` 后重试 |
| 列出目标 | `GET /api/v1/integrations` | `items[]` 中筛选 `type: "notification", provider: "telegram"`；`config.chatId` 可读，`config.botToken` 必须为 `"********"` |
| 新建目标 | `POST /api/v1/integrations` | `{ "name": "Telegram 通知", "type": "notification", "provider": "telegram", "enabled": true, "config": { "botToken": "...", "chatId": "..." } }` |
| 修改目标 | `PATCH /api/v1/integrations/:id` | `{ "name": "...", "config": { "chatId": "..." } }`；只在用户输入新 Token 时附带 `config.botToken` |
| 启停与删除 | `PATCH /api/v1/integrations/:id`、`DELETE /api/v1/integrations/:id` | 启停请求为 `{ "enabled": false }`；被规则引用时删除返回 `409 INTEGRATION_IN_USE` |
| 绑定规则 | `POST/PATCH /api/v1/rules` | `notificationIntegrationIds: string[]`，服务端验证 ID 对应通知集成；读回时保持该字段 |
| 告警列表 | `GET /api/v1/alerts` | `delivery.targets[]` 中每个目标含 `integrationId`、`status`、`attempts`，可选 `lastAttemptAt`、`nextAttemptAt`、`sentAt`、`errorCode` |

## 后端实现状态

以下能力已由 CryptoSentry 后端实现，前端已按实际响应结构接入：

1. `POST /api/v1/integrations/:id/test` 解密服务端保存的 Bot Token 并实际调用 Telegram `sendMessage`。成功返回 `{ "ok": true, "provider": "telegram", "delivery": { "status": "sent" } }`；Telegram 拒绝等可预期失败返回 HTTP 200、`ok: false`、`delivery.status: "failed"` 和脱敏的 `error.code/message`。Integration 停用等请求错误仍使用非 2xx API 错误结构。
2. 新告警会唤醒后台投递器。临时错误最多尝试 5 次，按指数退避并遵守 Telegram 429 的 `retry_after`；SQLite 保存待发送状态，服务重启后继续处理。
3. `GET /api/v1/alerts` 的 `delivery.targets[]` 返回 `pending`、`sending`、`sent`、`failed` 或 `skipped`，以及 `attempts`、可选的 `lastAttemptAt/nextAttemptAt/sentAt/errorCode`。前端每 10 秒刷新并显示这些状态。

投递语义为至少一次：请求成功响应前若进程或网络中断，重启后的重试可能产生重复 Telegram 消息。恢复通知当前不会单独发送。
