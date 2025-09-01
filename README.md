# Uniswap V3 流动性分析器

一个用于分析 Uniswap V3 池子流动性分布的工具，包含后端数据收集服务和前端分析界面。

## 🚀 新特性

- **精确的流动性计算**: 使用 Uniswap V3 的精确公式计算 tick 位置对应的代币数量
- **智能池子地址计算**: 根据 token0、token1 和费率自动计算池子地址
- **实时数据收集**: 定时从区块链节点收集流动性数据
- **现代化架构**: 使用 NestJS + Next.js + TypeScript 构建

## 项目结构

```
uniswap-v3-liquidity-analyzer/
├── backend/                 # 后端服务 (NestJS + TypeScript)
│   ├── src/
│   │   ├── config/         # 配置文件
│   │   ├── entities/       # 数据库实体
│   │   ├── services/       # 业务服务
│   │   ├── controllers/    # API控制器
│   │   ├── utils/          # 工具类
│   │   │   ├── uniswap-v3.utils.ts           # Uniswap V3 基础工具
│   │   │   └── uniswap-v3-liquidity-calculator.ts  # 流动性计算器
│   │   └── main.ts         # 主入口文件
│   ├── test/               # 单元测试
│   ├── package.json
│   └── tsconfig.json
├── frontend/                # 前端界面 (Next.js + TypeScript)
│   ├── src/
│   │   ├── app/            # 页面组件
│   │   ├── components/     # 可复用组件
│   │   └── services/       # API服务
│   └── package.json
├── start.sh                 # 一键启动脚本
├── QUICK_START.md          # 快速启动指南
└── README.md               # 详细文档
```

## 功能特性

### 后端服务
- 🕒 定时从区块链节点收集流动性数据
- 🗄️ 数据存储到 PostgreSQL 数据库
- 🔄 自动计算池子地址（基于 token0、token1 和费率）
- 📊 提供 RESTful API 接口
- ⚡ 使用 NestJS 框架，支持定时任务
- 🧮 **精确的流动性计算**: 使用 Uniswap V3 的精确公式计算代币数量

### 前端界面
- 🎨 现代化的 React 界面
- 📈 流动性分布图表展示
- 🔍 池子管理和监控
- 📱 响应式设计，支持移动端
- 🚀 基于 Next.js 13 App Router

## 技术栈

### 后端
- **框架**: NestJS
- **语言**: TypeScript
- **数据库**: PostgreSQL + TypeORM
- **区块链**: Ethers.js + Uniswap SDK
- **定时任务**: @nestjs/schedule
- **测试**: Jest + Chai

### 前端
- **框架**: Next.js 13
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **图表**: Chart.js + react-chartjs-2
- **UI组件**: Headless UI + Heroicons

## 核心算法

### 流动性计算器
项目包含一个专门的 `UniswapV3LiquidityCalculator` 类，实现了：

1. **精确的 Tick 价格计算**: 使用 Uniswap V3 的精确公式计算每个 tick 对应的 sqrt price
2. **代币数量计算**: 根据流动性、价格范围和当前价格计算 token0 和 token1 的数量
3. **总流动性分析**: 扫描所有初始化的 ticks，累积计算总代币数量
4. **活跃流动性范围**: 找到当前价格附近的活跃流动性范围

### 关键方法
- `getSqrtRatioAtTick(tick)`: 计算指定 tick 的 sqrt price
- `calculateTokenAmountsInRange()`: 计算特定范围内的代币数量
- `calculateTotalTokenAmounts()`: 计算池子中所有代币的总数量
- `findActiveLiquidityRange()`: 找到活跃流动性范围

## 快速开始

### 环境要求
- Node.js 18+
- PostgreSQL 12+
- Docker (可选，用于快速启动数据库)
- 以太坊节点访问权限

### 1. 一键启动（推荐）
```bash
# 确保 Docker 已启动
./start.sh
```

### 2. 手动启动
```bash
# 启动数据库
docker run -d \
    --name uniswap-v3-postgres \
    -e POSTGRES_DB=uniswap_v3_analyzer \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=password \
    -p 5432:5432 \
    postgres:13

# 配置环境变量
cd backend && cp env.example .env
cd ../frontend && cp env.local .env.local

# 启动后端
cd backend && npm install && npm run start:dev

# 启动前端
cd frontend && npm install && npm run dev
```

## API 接口

### 池子管理
- `POST /pools` - 创建新池子
- `GET /pools` - 获取所有池子
- `GET /pools/:address` - 获取指定池子信息
- `PUT /pools/:address/status` - 更新池子状态
- `DELETE /pools/:address` - 删除池子

### 流动性数据
- `GET /liquidity/pool/:poolAddress` - 获取池子流动性数据
- `GET /liquidity/pool/:poolAddress/stats` - 获取流动性统计
- `GET /liquidity/pool/:poolAddress/distribution` - 获取流动性分布

## 使用说明

### 1. 添加池子
1. 在前端界面点击"添加池子"按钮
2. 输入两个代币的合约地址
3. 选择费率等级（0.05%, 0.3%, 1%）
4. 系统会自动计算池子地址并开始监控

### 2. 监控流动性
- 后端服务会定时收集流动性数据
- 使用精确的算法计算每个 tick 的代币数量
- 数据自动存储到数据库
- 可通过前端界面查看实时数据

### 3. 分析数据
- 查看流动性分布图表
- 分析价格区间分布
- 监控流动性变化趋势
- 查看精确的代币数量计算

## 开发

### 后端开发
```bash
cd backend
npm run start:dev      # 开发模式
npm run build          # 构建
npm run start:prod     # 生产模式
npm test               # 运行测试
```

### 前端开发
```bash
cd frontend
npm run dev            # 开发模式
npm run build          # 构建
npm run start          # 生产模式
```

### 运行测试
```bash
cd backend
npm test               # 运行所有测试
npm run test:watch     # 监听模式
npm run test:cov       # 生成覆盖率报告
```

## 部署

### 生产环境配置
1. 修改环境变量配置
2. 关闭数据库同步模式
3. 配置反向代理
4. 设置 SSL 证书

### Docker 部署
```bash
# 构建镜像
docker build -t uniswap-v3-analyzer-backend ./backend
docker build -t uniswap-v3-analyzer-frontend ./frontend

# 运行容器
docker run -d -p 3001:3001 uniswap-v3-analyzer-backend
docker run -d -p 3000:3000 uniswap-v3-analyzer-frontend
```

## 算法说明

### 流动性计算原理
1. **扫描初始化 Ticks**: 从当前价格附近扫描所有已初始化的 ticks
2. **累积流动性**: 使用 `liquidityNet` 累积计算每个价格区间的活跃流动性
3. **代币数量计算**: 根据价格范围和当前价格，使用 Uniswap V3 的精确公式计算代币数量
4. **结果汇总**: 汇总所有价格区间的代币数量，得到池子中的总代币数量

### 优势
- **精确性**: 使用 Uniswap V3 的官方公式，确保计算准确性
- **效率**: 只扫描已初始化的 ticks，避免无效计算
- **实时性**: 支持实时数据更新和计算
- **可扩展性**: 模块化设计，易于扩展新功能

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
