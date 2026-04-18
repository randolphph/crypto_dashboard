# Crypto Dashboard

加密资产监控看板，聚合展示交易所账户、期权持仓和链上钱包的资产数据。

## 功能

- **交易所资产** — 支持 Binance、OKX 账户余额查询
- **期权持仓** — Deribit 期权仓位与损益展示
- **链上钱包** — 支持 Ethereum 和 Solana 钱包地址追踪
- **组合总览** — 汇总所有渠道资产，展示总价值与分布
- **设置管理** — 钱包地址管理、数据刷新频率配置
- **深色模式** — 支持亮色 / 深色主题切换

## 技术栈

- **框架**: [Next.js](https://nextjs.org/) 16 (App Router, RSC)
- **语言**: TypeScript
- **样式**: Tailwind CSS 4 + shadcn/ui
- **状态管理**: Zustand + TanStack React Query
- **链上交互**: viem (EVM) / @solana/web3.js (Solana)

## 快速开始

### 环境要求

- Node.js >= 18
- npm

### 安装与运行

```bash
# 克隆仓库
git clone <repo-url>
cd crypto-dashboard

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入交易所 API Key 等配置

# 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

### 构建生产版本

```bash
npm run build
npm start
```

## 项目结构

```
src/
├── app/                  # Next.js 路由与 API
│   ├── api/
│   │   ├── exchanges/    # Binance / OKX / Deribit API 代理
│   │   ├── onchain/      # 链上数据查询
│   │   └── prices/       # 价格聚合
│   ├── settings/         # 设置页面
│   └── page.tsx          # 首页（Dashboard）
├── components/
│   ├── common/           # 通用组件（主题切换等）
│   ├── dashboard/        # 看板组件
│   ├── layout/           # 布局组件
│   ├── settings/         # 设置组件
│   └── ui/               # shadcn/ui 基础组件
├── hooks/                # 自定义 Hooks
├── lib/                  # 工具函数与服务封装
│   ├── exchanges/        # 交易所 API 封装
│   └── onchain/          # 链上查询封装
├── stores/               # Zustand 状态管理
└── types/                # TypeScript 类型定义
```

## License

MIT
