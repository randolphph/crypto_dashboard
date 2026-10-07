# Bark 通知接入

入口：`/monitoring` →「数据源与通知」→「Bark 通知」。支持官方 Bark 服务器和自建服务器，配置多个设备目标，并在每条告警规则中与 Telegram 目标一起选择。通知由 CryptoSentry 后台投递，网页关闭后仍可发送。

## 配置与接口

所有请求通过 Dashboard 的 `/api/crypto-sentry/*` 代理进入 CryptoSentry `/api/v1/*`。

| 用途 | 请求 | 约定 |
|---|---|---|
| 创建 | `POST /integrations` | `type: "notification"`、`provider: "bark"`、`name`、`enabled`，以及下方 `config` |
| 列表 | `GET /integrations` | Bark 项的 `config.deviceKey` 脱敏为 `"********"`；服务器地址和分组可读 |
| 编辑 | `PATCH /integrations/:id` | 发送 `name` 和要更新的 `config` 字段；Device Key 留空时前端省略该字段，后端保留旧值 |
| 测试 | `POST /integrations/:id/test` | 实际发送测试消息，成功返回 `{ "ok": true, "provider": "bark", "delivery": { "status": "sent" } }`；预期投递失败返回 `ok: false`、`delivery.status: "failed"` 和脱敏错误 |
| 启停、删除 | `PATCH /integrations/:id`、`DELETE /integrations/:id` | 启停使用 `enabled`；被规则引用时禁止删除，返回 `409 INTEGRATION_IN_USE` |
| 绑定规则 | `POST/PATCH /rules` | `notificationIntegrationIds` 同时支持 Telegram 和 Bark 通知目标 ID |
| 投递状态 | `GET /alerts` | 复用 `delivery.targets[]` 的 `pending/sending/sent/failed/skipped`、尝试次数和下一次重试时间 |

```json
{
  "serverUrl": "https://api.day.app",
  "deviceKey": "your-device-key",
  "group": "CryptoSentry"
}
```

前端接受 Device Key 或官方应用示例推送地址，并将地址拆成服务器和 Key。自建服务带反向代理路径时，分别填写服务器地址和 Key。服务器地址不含用户凭据、查询参数或片段。修改服务器时请同时确认该服务器对应的 Device Key。

## 后台发送

按照 [Bark 官方 API](https://github.com/Finb/Bark/blob/master/docs/en-us/tutorial.md)，后端向 `{serverUrl}/push` 发送 JSON：`device_key`、`title`、`body`、`group`、`level`。Key 放在请求体中，避免出现在请求 URL。标题和正文沿用监控通知的中文格式。

| 监控告警级别 | Bark 等级 | 提醒方式 |
|---|---|---|
| 提示 `info`、警告 `warning` | `active` | 普通通知 |
| 严重 `critical` | `timeSensitive` | 时效性通知 |
| 紧急 `emergency` | `critical` | 最高等级的重要警告，静音模式下仍可响铃 |

根据 [Bark 官方参数文档](https://github.com/Finb/Bark/blob/master/docs/en-us/params.md#level)，重要警告需要 iOS 15 或更高版本，并开启 Bark 的“重要警告”权限；未授权时会降级成普通通知。可在 iPhone「设置 → 通知 → Bark」检查该权限。发送时保留 Bark 默认重要警告音量，不设置重复响铃。

只有 HTTP 成功且 Bark 响应 `code: 200` 才计为发送成功。网络错误、超时和服务端错误会重试；429 遵守 `Retry-After`；其他 4xx 停止重试。每个目标最多尝试 5 次，SQLite 保留待投递任务，服务重启后继续处理。投递语义为至少一次，网络中断时可能产生重复通知。

后端需同时包含 Bark 配置校验、Key 加密和日志脱敏、测试发送及后台投递支持。只部署 Dashboard 前端不能让旧版 CryptoSentry 自动支持 Bark。开发验证使用隔离后端和模拟推送，不等同于真实设备收件验证。
