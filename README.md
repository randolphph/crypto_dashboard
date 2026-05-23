# Crypto Dashboard

个人资产监控看板：聚合展示中心化交易所、链上钱包、股票券商持仓，并按现金 / 加密 / 股票 / 其它分类做组合层面的总览与历史趋势。

## 功能

### 加密资产
- **中心化交易所** — Binance（现货 + 合约 + 理财 + 资金账户）、OKX（含 Web3 链上钱包）、Deribit（期权）
- **链上钱包** — Ethereum / Solana 地址追踪，OKX Web3 API 解析多链余额
- **MSTR mNAV** — MSTR / BTC mNAV 曲线（来自独立后端服务，见下文）

### 股票
- **多市场** — A 股、港股、美股、韩股（KOSPI / KOSDAQ）
- **券商集成** — 同花顺（手工）、长桥（OpenAPI）、IBKR（Flex Query）；可三家混合
- **行情来源** — A 股 Sina + Tencent 兜底、港股 Tencent、美股 Yahoo + Stooq 兜底、韩股 Yahoo `.KS` / `.KQ`、所有市场 60s Upstash 缓存 + stale-on-error
- **期权与做空** — IBKR 期权和短头寸正确按 multiplier × 负 shares 估值（开仓收到的现金留在 cash 桶里）
- **排序与币种** — 涨跌 / 市值 / PnL 列排序；CNY / HKD / KRW 自动按汇率折回 USD

### 组合视图
- **顶部 KPI** — 总资产、按类目（加密 / 股票 / 现金 / 其它）和按账户（每家交易所 / 券商 / 链上钱包）双视角占比
- **资产变动曲线** — 最近 30 天保留每次刷新的快照（intraday 密度），更早的历史按本地日压缩成离 12:00 最近的一条，保留最多 3 年
- **现金流标注** — 在曲线上标记入金 / 出金事件，避免误读为收益

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
| `MNAV_API_BASE` / `MNAV_API_TOKEN` | MSTR mNAV 后端（见下文部署架构） |

> 凭据也可以走「钱包加密保险箱」流程从浏览器端注入——见设置页的"API Keys"卡片。

## 部署架构

```
┌────────────────────────────────┐        ┌───────────────────────────┐
│   Frontend (Vercel-style)      │        │   Mac mini @ home         │
│   ──────────────────────       │        │   ──────────────────      │
│   Next.js 16 RSC + API routes  │ HTTPS  │   MSTR mNAV server        │
│   Upstash Redis (cache)        │◄──────►│   Bun + SQLite + launchd  │
│   /api/mnav → upstream proxy   │        │   exposed via             │
└────────────────────────────────┘        │   Cloudflare Tunnel       │
                                          │   (mnav.randata.xyz)      │
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
│   │   ├── mnav/             # MSTR mNAV 后端代理
│   │   ├── onchain/          # 链上余额聚合
│   │   ├── prices/           # 加密币价
│   │   └── stocks/           # 三家券商持仓 + 行情 + FX 汇总
│   ├── mnav/                 # mNAV 详情页
│   ├── settings/             # 设置页（API Keys / 持仓 / 现金 / 钱包）
│   └── page.tsx              # Dashboard 首页
├── components/
│   ├── auth/                 # 钱包加密保险箱（Vault）
│   ├── common/               # 主题切换等
│   ├── dashboard/            # Portfolio / Stock / mNAV 等看板
│   ├── layout/               # Header / FxBadge / Theme
│   ├── settings/             # 凭据 / 持仓 / 现金管理
│   └── ui/                   # shadcn/ui 基础组件
├── hooks/                    # 自定义 Hooks（useStockData, useMnav, useFx, ...）
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
