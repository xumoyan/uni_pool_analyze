# Uniswap V4 支持文档

本项目现已支持 Uniswap V4 池子的分析和监控。本文档详细说明了 V4 支持的实现和使用方法。

## V4 与 V3 的主要区别

### 1. 架构变化
- **V3**: 每个池子是独立的合约，通过 Factory 合约创建
- **V4**: 单一 PoolManager 合约管理所有池子，使用 Singleton 模式

### 2. 池子标识方式
- **V3**: 通过池子合约地址标识 (`0x123...abc`)
- **V4**: 通过 PoolKey 结构体和 PoolId (bytes32 哈希值) 标识

### 3. PoolKey 结构
```typescript
interface PoolKey {
  currency0: string;    // token0 地址
  currency1: string;    // token1 地址
  fee: number;          // 费率
  tickSpacing: number;  // tick间距
  hooks: string;        // hooks合约地址
}
```

### 4. 新特性
- **Hooks 系统**: 每个池子可以有自定义的 hooks 合约
- **更灵活的费率**: 支持动态费率调整
- **Gas 优化**: 单一合约减少了跨合约调用

## 数据库结构

### 新增表结构

#### pools_v4 表
```sql
CREATE TABLE pools_v4 (
    id SERIAL PRIMARY KEY,
    pool_id VARCHAR(66) UNIQUE NOT NULL,  -- PoolId (bytes32)
    token0_address VARCHAR(42) NOT NULL,
    token1_address VARCHAR(42) NOT NULL,
    token0_symbol VARCHAR(20) NOT NULL,
    token1_symbol VARCHAR(20) NOT NULL,
    token0_decimals INTEGER NOT NULL,
    token1_decimals INTEGER NOT NULL,
    fee_tier INTEGER NOT NULL,
    tick_spacing INTEGER NOT NULL,
    hooks_address VARCHAR(42),
    pool_manager_address VARCHAR(42) NOT NULL,
    current_sqrt_price_x96 NUMERIC(78,0),
    current_tick INTEGER,
    total_liquidity NUMERIC(78,0),
    total_amount0 NUMERIC(78,0),
    total_amount1 NUMERIC(78,0),
    is_active BOOLEAN DEFAULT true,
    version VARCHAR(10) DEFAULT 'v4',
    chain_id INTEGER NOT NULL,
    pool_key JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### tick_liquidity_data 表更新
现有的 `tick_liquidity_data` 表已更新以支持 V4：
- 新增 `pool_id` 字段用于 V4 池子关联
- 新增 `version` 字段区分 V3/V4 数据

## API 接口

### V4 池子管理

#### 创建 V4 池子
```http
POST /pools-v4
Content-Type: application/json

{
  "token0Address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "token1Address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "feeTier": 3000,
  "tickSpacing": 60,
  "hooksAddress": "0x0000000000000000000000000000000000000000"
}
```

#### 获取所有 V4 池子
```http
GET /pools-v4
```

#### 根据 PoolId 获取池子
```http
GET /pools-v4/{poolId}
```

#### 计算 PoolId
```http
POST /pools-v4/calculate-pool-id
Content-Type: application/json

{
  "token0Address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  "token1Address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "feeTier": 3000,
  "tickSpacing": 60,
  "hooksAddress": "0x0000000000000000000000000000000000000000"
}
```

### V4 流动性数据

#### 获取 V4 池子流动性
```http
GET /liquidity-v4/pool/{poolId}?limit=1000&offset=0
```

#### 获取指定范围的 V4 流动性
```http
GET /liquidity-v4/pool/{poolId}/range?tickLower=-1000&tickUpper=1000
```

#### 获取 V4 流动性统计
```http
GET /liquidity-v4/pool/{poolId}/stats
```

#### 获取 V4 流动性分布
```http
GET /liquidity-v4/pool/{poolId}/distribution?bins=20
```

### V4 收益数据

#### 手动收集 V4 池子收益
```http
POST /revenue-v4/collect/{poolId}?date=2024-01-01
```

#### 获取 V4 收益历史
```http
GET /revenue-v4/history/{poolId}?startDate=2024-01-01&endDate=2024-01-31&limit=100
```

#### 获取所有 V4 池子最新收益
```http
GET /revenue-v4/latest-all
```

#### 获取 V4 收益图表数据
```http
GET /revenue-v4/chart-data?poolIds=0x123...,0x456...&startDate=2024-01-01&endDate=2024-01-31
```

#### 获取 V4 收益统计
```http
GET /revenue-v4/stats/{poolId}
```

## 环境配置

### 必需的环境变量
```bash
# V4 PoolManager 合约地址 (需要实际部署地址)
POOL_MANAGER_ADDRESS=0x0000000000000000000000000000000000000000

# 支持的版本
SUPPORTED_VERSIONS=v3,v4
```

### 完整的 .env 示例
```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=uniswap_v3_analyzer
DB_USER=postgres
DB_PASSWORD=password
DB_SSL=false

# RPC配置
RPC_URL=http://localhost:8545
CHAIN_ID=1

# Uniswap 合约地址
FACTORY_ADDRESS=0x1F98431c8aD98523631AE4a59f267346ea31F984
POOL_MANAGER_ADDRESS=0x0000000000000000000000000000000000000000

# 支持的版本
SUPPORTED_VERSIONS=v3,v4

# 应用配置
PORT=3001
SCAN_INTERVAL=60000
MAX_TICKS_PER_SCAN=10000
```

## 使用说明

### 1. 启动服务
```bash
cd backend
npm install
npm run start:dev
```

### 2. 添加 V4 池子
使用提供的脚本添加 V4 池子：
```bash
node add-v4-pools.js
```

### 3. 手动触发数据收集
```bash
# 收集流动性数据
curl -X POST http://localhost:3001/pools-v4/{poolId}/collect

# 收集收益数据
curl -X POST http://localhost:3001/revenue-v4/collect/{poolId}
```

### 4. 自动数据收集
系统会自动定时收集数据：
- V4 流动性数据：每天凌晨 1:00
- V4 收益数据：每天凌晨 2:00

## 注意事项

### 1. PoolManager 地址
当前配置中的 PoolManager 地址为占位符，需要替换为实际的 V4 PoolManager 合约地址。

### 2. Hooks 支持
当前实现支持 hooks 地址的存储和查询，但具体的 hooks 逻辑需要根据实际的 hooks 合约进行调整。

### 3. 费率计算
V4 支持动态费率，当前实现使用池子创建时的费率，实际使用中可能需要实时获取当前费率。

### 4. 事件监听
V4 的事件结构与 V3 略有不同，特别是 Swap 事件使用 int128 而不是 int256。

### 5. 兼容性
V3 和 V4 的功能完全独立，可以同时运行，不会相互影响。

## 开发指南

### 添加新功能
1. 在对应的 V4 服务中添加业务逻辑
2. 在 V4 控制器中添加 API 端点
3. 更新数据库结构（如需要）
4. 添加相应的测试

### 调试技巧
1. 使用 PoolId 而不是地址进行调试
2. 检查 PoolKey 的计算是否正确
3. 验证 hooks 地址的处理
4. 确认事件解析的正确性

## 故障排除

### 常见问题
1. **PoolId 计算错误**: 检查 PoolKey 的字段顺序和编码方式
2. **事件获取失败**: 确认 PoolManager 合约地址正确
3. **数据不一致**: 检查 V3/V4 数据的隔离是否正确
4. **性能问题**: 考虑添加数据库索引和查询优化

### 日志查看
```bash
# 查看应用日志
tail -f logs/application.log

# 查看特定服务的日志
grep "PoolV4" logs/application.log
```

## 未来扩展

### 计划功能
1. V4 特有的 hooks 分析
2. 动态费率监控
3. 跨版本池子比较
4. V4 特定的图表和可视化

### 性能优化
1. 批量数据处理优化
2. 缓存策略改进
3. 数据库查询优化
4. 并发处理能力提升
