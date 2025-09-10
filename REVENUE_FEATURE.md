# 池子收益统计功能

本功能实现了按天统计Uniswap V3池子收益情况的完整解决方案，包括数据收集、存储和可视化展示。

## 功能特性

- ✅ 按天统计池子收益数据
- ✅ 支持历史数据同步
- ✅ 多池子收益趋势对比
- ✅ USD价值计算和展示
- ✅ 可视化图表展示
- ✅ 手动数据收集和同步

## 数据库表结构

### pool_daily_revenue 表

该表存储每个池子每天的收益统计数据：

```sql
-- 核心字段
pool_address: 池子地址
date: 统计日期
block_number: 当日最后一个区块号
block_timestamp: 当日最后一个区块时间戳

-- 收益数据
fee_revenue_token0: Token0手续费收入（原始数值）
fee_revenue_token1: Token1手续费收入（原始数值）
fee_revenue_token0_formatted: Token0手续费收入（格式化显示）
fee_revenue_token1_formatted: Token1手续费收入（格式化显示）

-- 价格和流动性信息
price_at_start: 当日开始价格
price_at_end: 当日结束价格
price_change_percent: 当日价格变化百分比
total_liquidity: 当日结束时总流动性

-- 交易量数据
volume_token0: 当日Token0交易量
volume_token1: 当日Token1交易量

-- USD价值
fee_revenue_usd: 手续费收入USD价值
volume_usd: 交易量USD价值
```

## 安装和设置

### 1. 创建数据库表

```bash
# 方法1: 直接执行SQL文件
psql -h localhost -U postgres -d uniswap_v3_analyzer -f backend/sql/create_pool_daily_revenue.sql

# 方法2: 使用Node.js脚本
cd backend
node scripts/create-revenue-table.js
```

### 2. 安装前端依赖

```bash
cd frontend
npm install recharts
```

### 3. 更新后端配置

确保在 `app.module.ts` 中已注册新的实体和服务：

```typescript
// 已自动更新
entities: [Pool, TickLiquidity, PoolDailyRevenue]
providers: [PoolManagerService, LiquidityCollectorService, PoolRevenueCollectorService]
controllers: [PoolController, LiquidityController, RevenueController]
```

## API 接口

### 收益数据管理

```bash
# 手动触发收集指定池子的每日收益数据
POST /revenue/collect/{poolAddress}?date=2024-01-15

# 批量同步历史收益数据
POST /revenue/sync-historical?poolAddress={address}&startBlockNumber=18000000&endBlockNumber=19000000&blockInterval=7200

# 获取池子的收益历史数据
GET /revenue/history/{poolAddress}?startDate=2024-01-01&endDate=2024-01-31&limit=100

# 获取所有池子的最新收益数据
GET /revenue/latest-all

# 获取多个池子的收益历史数据（用于前端图表）
GET /revenue/chart-data?poolAddresses=0x123,0x456&startDate=2024-01-01&endDate=2024-01-31

# 手动触发所有池子的收益数据收集
POST /revenue/collect-all

# 获取收益数据统计信息
GET /revenue/stats/{poolAddress}
```

### 响应格式示例

```json
{
  "success": true,
  "message": "获取收益历史数据成功",
  "data": [
    {
      "id": 1,
      "poolAddress": "0x...",
      "date": "2024-01-15",
      "blockNumber": "18900000",
      "feeRevenueToken0": "1000000000000000000",
      "feeRevenueToken1": "2000000000",
      "feeRevenueToken0Formatted": "1.0",
      "feeRevenueToken1Formatted": "2000.0",
      "feeRevenueUsd": "4000.00",
      "volumeUsd": "100000.00",
      "priceAtStart": "2000.123456",
      "priceAtEnd": "2010.654321",
      "priceChangePercent": "0.5234",
      "pool": {
        "address": "0x...",
        "token0Symbol": "ETH",
        "token1Symbol": "USDC",
        "feeTier": 3000
      }
    }
  ],
  "total": 30,
  "limit": 100
}
```

## 前端使用

### 1. 访问收益分析页面

```
http://localhost:3000/revenue
```

### 2. 主要功能

- **数据管理面板**: 选择池子、触发数据收集、同步历史数据
- **收益趋势图**: 多池子收益对比，支持隐藏/显示特定池子
- **统计信息**: 显示总收益、平均日收益等关键指标

### 3. 组件使用

```tsx
import RevenueChart from '../components/RevenueChart';

// 在页面中使用
<RevenueChart className="mb-8" />
```

## 定时任务

系统会自动在每天凌晨1点收集前一天的收益数据：

```typescript
@Cron(CronExpression.EVERY_DAY_AT_1AM)
async collectDailyRevenue() {
  // 自动收集所有活跃池子的收益数据
}
```

## 价格计算

当前使用固定价格映射进行USD价值计算：

```typescript
const TOKEN_PRICES: { [key: string]: number } = {
  'ETH': 2000,
  'WETH': 2000,
  'BTC': 40000,
  'WBTC': 40000,
  'USDC': 1,
  'USDT': 1,
  'DAI': 1,
};
```

**注意**: 生产环境中应该接入价格预言机（如Chainlink）或DEX价格API获取实时价格。

## 数据收集流程

### 1. 自动收集（定时任务）
- 每天凌晨1点自动触发
- 收集所有活跃池子的前一天数据

### 2. 手动收集
- 通过API接口触发
- 支持指定日期收集
- 支持单个池子或所有池子

### 3. 历史数据同步
- 从指定区块开始同步
- 按固定区块间隔（默认7200块/天）收集
- 避免重复收集已存在的数据

## 性能优化

### 1. 数据库索引
- 池子地址索引
- 日期索引
- 区块号索引
- 复合索引（池子地址+日期）

### 2. API限流
- 避免RPC请求过于频繁
- 批量处理数据
- 错误重试机制

### 3. 前端优化
- 图表数据缓存
- 懒加载
- 分页加载

## 故障排除

### 常见问题

1. **数据收集失败**
   - 检查RPC连接
   - 验证池子地址
   - 查看区块高度是否正确

2. **图表不显示**
   - 确认有收益数据
   - 检查日期范围
   - 验证池子选择

3. **价格计算错误**
   - 更新代币价格映射
   - 检查小数位精度
   - 验证代币符号

### 日志查看

```bash
# 后端日志
cd backend
npm run start

# 查看收益收集日志
grep "收益" logs/app.log
```

## 扩展功能

### 未来可以添加的功能

1. **实时价格集成**
   - Chainlink价格预言机
   - CoinGecko API
   - Uniswap TWAP价格

2. **更多统计指标**
   - APR/APY计算
   - 无常损失计算
   - 流动性提供者收益分析

3. **通知功能**
   - 收益异常告警
   - 定期收益报告
   - 邮件/微信通知

4. **数据导出**
   - CSV导出
   - PDF报告生成
   - 数据API

## 总结

这个收益统计功能提供了完整的Uniswap V3池子收益分析解决方案，包括：

- ✅ 完整的数据模型和数据库设计
- ✅ 自动化数据收集和同步
- ✅ RESTful API接口
- ✅ 可视化图表展示
- ✅ 用户友好的管理界面

该功能可以帮助用户：
- 跟踪池子的历史收益表现
- 对比不同池子的收益情况
- 分析收益趋势和模式
- 做出更好的流动性提供决策
