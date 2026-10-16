# Crypto Dashboard

个人资产监控看板：聚合展示中心化交易所、链上钱包、股票券商持仓，按可管理的资产分类展示分布与历史趋势。

## 功能

### 加密资产
- **中心化交易所** — Binance（现货 + 合约 + 理财 + 资金账户）、OKX（含 Web3 链上钱包）、Deribit（期权）
- **链上钱包** — Ethereum / Plasma / Robinhood Chain / Solana / Bitcoin 等地址追踪，OKX Web3 API 解析多链余额
- **链上缓存** — 按钱包缓存完整余额、DeFi 和去重结果；10 分钟有效期，Upstash 保留最近成功数据 7 天，浏览器 IndexedDB 保留 30 天。先显示缓存、过期后台更新，支持手动强制刷新；失败保留旧数据并标注实际采集时间。页面每 2 分钟检查一次，关闭自动刷新后仅打开页面或手动操作触发检查；没有独立定时任务，关闭页面后不会持续查询；历史快照独立保存。

### 股票
- **多市场** — A 股、港股、美股、韩股（KOSPI / KOSDAQ）
- **券商集成** — 同花顺（手工）、长桥（OpenAPI）、IBKR（Flex Query）；可三家混合
- **行情来源** — A 股 Sina + Tencent 兜底、港股 Tencent、美股 Yahoo + Stooq 兜底、韩股 Yahoo `.KS` / `.KQ`、所有市场 60s Upstash 缓存 + stale-on-error
- **期权与做空** — IBKR 期权和短头寸正确按 multiplier × 负 shares 估值（开仓收到的现金留在 cash 桶里）
- **排序与币种** — 涨跌 / 市值 / PnL 列排序；CNY / HKD / KRW 自动按汇率折回 USD

### 组合视图
- **资产分类** — 默认现金及等价物 / 股票 / 加密资产 / 美股；逐项下拉选择分类，直接汇总饼图，无需 AI 分析。美股分类不可删除，选择后需关联美股代码，券商美股自动识别已有代码；改为其他分类后交易所及链上资产的关联不再生效。支持新增、重命名、查询和删除普通分类；删除时将关联资产转入所选普通分类，设置默认分类，标签保存在本机浏览器。Deribit 按账户净值分类，DeFi 按协议仓位分类，底层明细不重复计入。
- **顶部 KPI** — 总资产、按类目（加密 / 股票 / 现金 / 其它）和按账户（每家交易所 / 券商 / 链上钱包）双视角占比
- **资产变动曲线** — 最近 30 天保留每次刷新的快照（intraday 密度），更早的历史按本地日压缩成离 12:00 最近的一条，保留最多 3 年
- **现金流标注** — 在曲线上标记入金 / 出金事件，避免误读为收益

### 行情与 DeFi 监控
- **美股价格监控** — 添加股票代码、检查频率、目标价格规则和通知目标；CryptoSentry 后台执行，支持新浪 / Yahoo / 币安自动切换，也可指定单一来源，详见 [美股监控](docs/us-stock-monitoring.md)。需同步部署新版后端。
- **云端监控** — 通过 CryptoSentry 创建 Aave 与 Uniswap 钱包监控，网页端只经由 Next.js 服务端代理访问
- **数据源初始化** — 根据后端目录一键配置 Binance 公共行情，或添加 Alchemy / Infura / QuickNode / 自定义 EVM RPC
- **多链 RPC 管理** — 一次可选择多个 EVM 网络并逐链配置端点；Aave 与 Uniswap 共用 RPC 池，支持新增、编辑、启停、测试与删除
- **运行状态** — 每 10 秒检查后端 API、引擎心跳、运行组件和 Monitor 状态，连接中断时明确显示离线
- **能力门禁** — RPC 保存后立即测试连接；Uniswap 创建前还会验证所选 V3 / V4 能力
- **仓位状态** — 每 10 秒轮询多链 Aave 仓位、资产、债务与健康因子
- **Uniswap LP** — Robinhood Chain（chainId 4663）RPC 同时支持 V3 / V4，使用钱包地址自动发现 LP，并展示同步进度、区间状态与仓位详情
- **风险规则与告警** — 首次成功扫描后自动创建默认健康因子规则，并展示历史告警
- **Telegram 通知** — 输入 Bot Token 后自动发现最近会话并测试发送，也可手工填写 Chat ID；告警规则支持选择目标并查看发送、重试或失败状态，接口约定见 [Telegram 后端对接](docs/telegram-backend-contract.md)
- **Bark 通知** — 配置 iPhone 的 Device Key 或推送地址，支持官方和自建服务器、测试发送、规则绑定及投递状态；需 CryptoSentry 后端同时支持，接口约定见 [Bark 后端对接](docs/bark-backend-contract.md)

### 安全与配置
- **钱包加密保险箱** — 浏览器端 API Key 经 EVM 钱包签名派生密钥后 AES 加密存 localStorage；无明文留痕，可跨设备靠相同钱包解锁
- **服务端凭据** — 也支持纯环境变量模式（Vercel 部署 / 自托管），与钱包保险箱二选一
- **深色模式** — 跟随系统 / 手动切换

## 技术栈

| 类别 | 选型 |
|---|---|
| 框架 | Next.js 16 (App Router, RSC) |
| 语言 | TypeScript |
| UI | Tailwind CSS 4、shadcn/ui、Base UI、Recharts、Lucide |
| 状态 | Zustand（持久化 + 钱包加密）、TanStack Query |
| 缓存 | Upstash Redis（A/HK/US/KR 行情、IBKR Flex 快照） |
| 链上 | viem (EVM)、@solana/web3.js (Solana)、OKX Web3 API |
| 加密 | Web Crypto API（AES-GCM + PBKDF2/HKDF）|

## 快速开始

```bash
git clone <repo-url>
cd crypto-dashboard
npm install
cp .env.example .env    # 填入需要的凭据（见下节，全部可选）
npm run dev             # http://localhost:3000
```

本地若因 DNS 或网络问题无法连接 OKX 等数据源，可以使用已有的 HTTP 代理：在 `.env.local` 中设置 `HTTPS_PROXY=http://127.0.0.1:7897`（端口以自己的代理为准）及 `NO_PROXY=localhost,127.0.0.1,::1`，然后运行 `npm run dev:proxy`。此命令需要支持 `--use-env-proxy` 的 Node（已在 v25.9.0 验证），仅影响该开发服务，不修改系统 DNS、Tailscale 或 Clash 配置；普通 `npm run dev` 保持原启动方式。线上部署不要配置本机代理地址。

生产构建：
```bash
npm run build && npm start
```

## 环境变量

所有变量都**可选**——只配你用得到的源。未配的板块在 UI 上自动隐藏 / 提示。

### 交易所
| 变量 | 用途 |
|---|---|
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | Binance 现货 / 合约 / 理财查询（只读 key） |
| `BINANCE_ENABLE_GRID_BOT` | 是否拉取网格交易余额（`true` / `false`） |
| `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_PASSPHRASE` | OKX 账户查询（只读 key） |
| `DERIBIT_CLIENT_ID` / `DERIBIT_CLIENT_SECRET` | Deribit 期权持仓 |

### 链上
| 变量 | 用途 |
|---|---|
| `OKX_WEB3_API_KEY` / `OKX_WEB3_API_SECRET` / `OKX_WEB3_PASSPHRASE` / `OKX_WEB3_PROJECT_ID` | OKX Web3 API 解析多链钱包（[申请地址](https://web3.okx.com/onchainos/dev-portal/project)） |
| `ETHEREUM_RPC_URL` | EVM 自定义 RPC（不填走公共节点） |
| `SOLANA_RPC_URL` | Solana 自定义 RPC（不填走公共节点） |

### 券商
| 变量 | 用途 |
|---|---|
| `LONGPORT_APP_KEY` / `LONGPORT_APP_SECRET` / `LONGPORT_ACCESS_TOKEN` | 长桥 OpenAPI（[创建凭证](https://open.longportapp.com/)） |
| `IBKR_FLEX_TOKEN` / `IBKR_FLEX_QUERY_ID` | IBKR Flex Query（账户管理 → Reports → Flex Queries） |

### 基础设施
| 变量 | 用途 |
|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash REST 缓存（也兼容 `KV_REST_API_URL` / `KV_REST_API_TOKEN` Vercel KV 命名） |
| `MNAV_API_BASE` / `MNAV_API_TOKEN` | 家用后端 API（快照推送 / 导出，见下文部署架构） |
| `CRYPTOSENTRY_API_URL` / `CRYPTOSENTRY_API_TOKEN` | CryptoSentry 后端地址与 Bearer Token；仅在 Next.js 服务端使用 |

> 凭据也可以走「钱包加密保险箱」流程从浏览器端注入——见设置页的"API Keys"卡片。

## 部署架构

```
┌────────────────────────────────┐        ┌───────────────────────────┐
│   Frontend (Vercel-style)      │        │   Mac mini @ home         │
│   ──────────────────────       │        │   ──────────────────      │
│   Next.js 16 RSC + API routes  │ HTTPS  │   Snapshot / data server  │
│   Upstash Redis (cache)        │◄──────►│   Bun + SQLite + launchd  │
│   /api/snapshot → upstream     │        │   exposed via             │
└────────────────────────────────┘        │   Cloudflare Tunnel       │
                                          │   (randata.xyz)           │
                                          └───────────────────────────┘
```

前端无状态部署，对延迟敏感的爬虫 / 长尾数据源放在家用服务器上经 Cloudflare Tunnel 反向暴露。该后端代码不在本仓库。

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── exchanges/        # Binance / OKX / Deribit 代理
│   │   ├── fx/               # 汇率
│   │   ├── onchain/          # 链上余额聚合
│   │   ├── prices/           # 加密币价
│   │   └── stocks/           # 三家券商持仓 + 行情 + FX 汇总
│   ├── settings/             # 设置页（API Keys / 持仓 / 现金 / 钱包）
│   └── page.tsx              # Dashboard 首页
├── components/
│   ├── auth/                 # 钱包加密保险箱（Vault）
│   ├── common/               # 主题切换等
│   ├── dashboard/            # Portfolio / Stock 等看板
│   ├── layout/               # Header / FxBadge / Theme
│   ├── settings/             # 凭据 / 持仓 / 现金管理
│   └── ui/                   # shadcn/ui 基础组件
├── hooks/                    # 自定义 Hooks（useStockData, useFx, ...）
├── lib/
│   ├── auth/                 # Vault 加密 / 钱包签名
│   ├── cache/                # Upstash 客户端
│   ├── exchanges/            # 交易所 API 封装
│   ├── ibkr/                 # IBKR Flex 查询、解析、缓存
│   ├── longport/             # 长桥签名与持仓
│   ├── onchain/              # 链上余额查询
│   └── stocks/               # 行情 / FX / 缓存层
├── stores/                   # Zustand（含 portfolioHistoryStore 等）
└── types/                    # 共享类型
```

## License

MIT
