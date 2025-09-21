import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 为长时间运行的操作创建专门的API实例（如历史数据同步）
const longRunningApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 600000, // 10分钟超时
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.data);
    return response.data;
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// 长时间运行API的拦截器
longRunningApi.interceptors.request.use(
  (config) => {
    console.log('Long Running API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

longRunningApi.interceptors.response.use(
  (response) => {
    console.log('Long Running API Response:', response.data);
    return response.data;
  },
  (error) => {
    console.error('Long Running API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export interface Pool {
  id: number;
  address: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  feeTier: number;
  tickSpacing: number;
  currentTick: number;
  totalLiquidity: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  totalAmount0: string;
  totalAmount1: string;
}

export interface CreatePoolDto {
  token0Address: string;
  token1Address: string;
  feeTier: number;
}

// V4 池子接口
export interface PoolV4 {
  id: number;
  poolId: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  feeTier: number;
  tickSpacing: number;
  hooksAddress: string;
  poolManagerAddress: string;
  currentTick: number;
  totalLiquidity: string;
  isActive: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
  totalAmount0: string;
  totalAmount1: string;
  chainId: number;
  poolKey: {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
  };
}

export interface CreatePoolV4Dto {
  token0Address: string;
  token1Address: string;
  feeTier: number;
  tickSpacing: number;
  hooksAddress?: string;
}

export interface TickLiquidity {
  id: number;
  poolAddress: string;
  tick: number;
  price: number;
  liquidityGross: string;
  liquidityNet: string;
  initialized: boolean;
  token0Amount: string;
  token1Amount: string;
  token0AmountFormatted: number;
  token1AmountFormatted: number;
  activeLiquidity: string;
  distanceFromCurrent: number;
  scannedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface LiquidityStats {
  total_ticks: string;
  total_liquidity: string;
  avg_liquidity: string;
  min_tick: number;
  max_tick: number;
  min_price: number;
  max_price: number;
}

export interface LiquidityDistribution {
  binIndex: number;
  tickLower: number;
  tickUpper: number;
  tickCount: number;
  totalLiquidity: string;
  totalToken0: string;
  totalToken1: string;
  avgPrice: number;
}

export const poolApi = {
  // 获取所有池子
  getAllPools: () => api.get<Pool[]>('/pools'),

  // 根据地址获取池子
  getPoolByAddress: (address: string) => api.get<Pool>(`/pools/${address}`),

  // 创建新池子
  createPool: (data: CreatePoolDto) => api.post<Pool>('/pools', data),

  // 获取池子统计信息
  getPoolStats: (address: string) => api.get<LiquidityStats>(`/pools/${address}/stats`),

  // 更新池子状态
  updatePoolStatus: (address: string, isActive: boolean) =>
    api.put(`/pools/${address}/status`, { isActive }),

  // 删除池子
  deletePool: (address: string) => api.delete(`/pools/${address}`),

  // 手动收集数据
  manualCollect: (address: string) => api.post(`/pools/${address}/collect`),
};

// V4 池子 API
export const poolV4Api = {
  // 获取所有 V4 池子
  getAllPoolsV4: () => api.get<PoolV4[]>('/pools-v4'),

  // 根据 PoolId 获取池子
  getPoolByPoolId: (poolId: string) => api.get<PoolV4>(`/pools-v4/${poolId}`),

  // 创建新 V4 池子
  createPoolV4: (data: CreatePoolV4Dto) => api.post<PoolV4>('/pools-v4', data),

  // 计算 PoolId
  calculatePoolId: (data: CreatePoolV4Dto) =>
    api.post<{ poolKey: object; poolId: string }>('/pools-v4/calculate-pool-id', data),

  // 根据代币查找池子
  findPoolByTokens: (
    token0Address: string,
    token1Address: string,
    feeTier: number,
    tickSpacing: number,
    hooksAddress?: string
  ) =>
    api.get<{ found: boolean; pool?: PoolV4 }>('/pools-v4/find-by-tokens', {
      params: {
        token0Address,
        token1Address,
        feeTier,
        tickSpacing,
        hooksAddress,
      },
    }),

  // 获取 V4 池子统计信息
  getPoolStats: (poolId: string) => api.get<LiquidityStats>(`/pools-v4/${poolId}/stats`),

  // 更新 V4 池子状态
  updatePoolStatus: (poolId: string, isActive: boolean) =>
    api.put(`/pools-v4/${poolId}/status`, { isActive }),

  // 删除 V4 池子
  deletePool: (poolId: string) => api.delete(`/pools-v4/${poolId}`),

  // 手动收集 V4 数据
  manualCollect: (poolId: string) => api.post(`/pools-v4/${poolId}/collect`),
};

interface LiquidityResponse {
  data: TickLiquidity[]
  total: number
}

interface DistributionResponse {
  distributions: LiquidityDistribution[]
}

export const liquidityApi = {
  // 获取池子流动性数据
  getPoolLiquidity: (poolAddress: string, limit = 1000, offset = 0) =>
    api.get<LiquidityResponse>(`/liquidity/pool/${poolAddress}`, {
      params: { limit, offset },
    }),

  // 获取池子所有 tick 数据（大页拉取）
  getAllPoolLiquidity: (poolAddress: string) =>
    api.get<LiquidityResponse>(`/liquidity/pool/${poolAddress}`, {
      params: { limit: 10000, offset: 0 },
    }),

  // 获取指定范围的流动性数据
  getLiquidityInRange: (poolAddress: string, tickLower: number, tickUpper: number) =>
    api.get(`/liquidity/pool/${poolAddress}/range`, {
      params: { tickLower, tickUpper },
    }),

  // 获取流动性统计信息
  getLiquidityStats: (poolAddress: string) =>
    api.get<LiquidityStats>(`/liquidity/pool/${poolAddress}/stats`),

  // 获取流动性分布
  getLiquidityDistribution: (poolAddress: string, bins = 20) =>
    api.get<DistributionResponse>(`/liquidity/pool/${poolAddress}/distribution`, {
      params: { bins },
    }),
};

// V4 流动性 API
export const liquidityV4Api = {
  // 获取 V4 池子流动性数据
  getPoolLiquidity: (poolId: string, limit = 1000, offset = 0) =>
    api.get<LiquidityResponse>(`/liquidity-v4/pool/${poolId}`, {
      params: { limit, offset },
    }),

  // 获取 V4 池子所有 tick 数据
  getAllPoolLiquidity: (poolId: string) =>
    api.get<LiquidityResponse>(`/liquidity-v4/pool/${poolId}`, {
      params: { limit: 10000, offset: 0 },
    }),

  // 获取 V4 指定范围的流动性数据
  getLiquidityInRange: (poolId: string, tickLower: number, tickUpper: number) =>
    api.get(`/liquidity-v4/pool/${poolId}/range`, {
      params: { tickLower, tickUpper },
    }),

  // 获取 V4 流动性统计信息
  getLiquidityStats: (poolId: string) =>
    api.get<LiquidityStats>(`/liquidity-v4/pool/${poolId}/stats`),

  // 获取 V4 流动性分布
  getLiquidityDistribution: (poolId: string, bins = 20) =>
    api.get<DistributionResponse>(`/liquidity-v4/pool/${poolId}/distribution`, {
      params: { bins },
    }),
};

// 收益数据相关接口
export interface PoolDailyRevenue {
  id: number;
  poolAddress: string;
  date: string;
  blockNumber: string;
  blockTimestamp: string;
  feeRevenueToken0: string;
  feeRevenueToken1: string;
  feeRevenueToken0Formatted: string;
  feeRevenueToken1Formatted: string;
  liquidityChange: string;
  totalLiquidity: string;
  priceAtStart: string;
  priceAtEnd: string;
  priceChangePercent: string;
  volumeToken0: string;
  volumeToken1: string;
  volumeToken0Formatted: string;
  volumeToken1Formatted: string;
  feeRevenueUsd: string;
  volumeUsd: string;
  createdAt: string;
  updatedAt: string;
  pool: Pool;
}

export interface RevenueChartData {
  poolAddress: string;
  pool: Pool;
  data: PoolDailyRevenue[];
}

export interface RevenueStats {
  totalDays: number;
  totalFeeRevenueUsd: string;
  totalVolumeUsd: string;
  avgDailyRevenueUsd: string;
  avgDailyVolumeUsd: string;
  firstRecordDate: string;
  lastRecordDate: string;
}

export const revenueApi = {
  // 手动触发收集指定池子的每日收益数据
  collectPoolRevenue: (poolAddress: string, date?: string) =>
    api.post(`/revenue/collect/${poolAddress}`, {}, { params: { date } }),

  // 批量同步历史收益数据
  syncHistoricalRevenue: (
    poolAddress: string,
    startBlockNumber?: number,
    endBlockNumber?: number,
    blockInterval?: number
  ) =>
    api.post('/revenue/sync-historical', {}, {
      params: {
        poolAddress,
        startBlockNumber,
        endBlockNumber,
        blockInterval,
      },
    }),

  // 获取池子的收益历史数据
  getPoolRevenueHistory: (
    poolAddress: string,
    startDate?: string,
    endDate?: string,
    limit?: number
  ) =>
    api.get<{
      data: PoolDailyRevenue[];
      total: number;
      limit: number;
    }>(`/revenue/history/${poolAddress}`, {
      params: { startDate, endDate, limit },
    }),

  // 获取所有池子的最新收益数据
  getAllPoolsLatestRevenue: () =>
    api.get<{
      data: PoolDailyRevenue[];
      total: number;
    }>('/revenue/latest-all'),

  // 获取多个池子的收益历史数据（用于前端图表）
  getRevenueChartData: (
    poolAddresses: string[],
    startDate?: string,
    endDate?: string,
    limit?: number
  ) =>
    api.get<{
      data: RevenueChartData[];
    }>('/revenue/chart-data', {
      params: {
        poolAddresses: poolAddresses.join(','),
        startDate,
        endDate,
        limit,
      },
    }),

  // 手动触发所有池子的收益数据收集
  collectAllPoolsRevenue: (date?: string) =>
    api.post('/revenue/collect-all', {}, { params: { date } }),

  // 获取收益数据统计信息
  getRevenueStats: (poolAddress: string) =>
    api.get<{
      data: RevenueStats;
    }>(`/revenue/stats/${poolAddress}`),
};

// V4 收益 API
export const revenueV4Api = {
  // 手动触发收集指定 V4 池子的每日收益数据
  collectPoolRevenue: (poolId: string, date?: string) =>
    api.post(`/revenue-v4/collect/${poolId}`, {}, { params: { date } }),

  // 获取 V4 池子的收益历史数据
  getPoolRevenueHistory: (
    poolId: string,
    startDate?: string,
    endDate?: string,
    limit?: number
  ) =>
    api.get<{
      data: PoolDailyRevenue[];
      total: number;
      limit: number;
    }>(`/revenue-v4/history/${poolId}`, {
      params: { startDate, endDate, limit },
    }),

  // 获取所有 V4 池子的最新收益数据
  getAllPoolsLatestRevenue: () =>
    api.get<{
      data: PoolDailyRevenue[];
      total: number;
    }>('/revenue-v4/latest-all'),

  // 批量收集所有 V4 池子的收益数据
  collectAllPoolsRevenue: (date?: string) =>
    api.post('/revenue-v4/collect-all', {}, { params: { date } }),

  // 获取多个 V4 池子的收益历史数据（用于前端图表）
  getRevenueChartData: (
    poolIds: string[],
    startDate?: string,
    endDate?: string,
    limit?: number
  ) =>
    api.get<{
      data: RevenueChartData[];
    }>('/revenue-v4/chart-data', {
      params: {
        poolIds: poolIds.join(','),
        startDate,
        endDate,
        limit,
      },
    }),

  // 手动触发所有 V4 池子的收益数据收集
  collectAllPoolsRevenue: (date?: string) =>
    api.post('/revenue-v4/collect-all', {}, { params: { date } }),

  // 获取 V4 收益数据统计信息
  getRevenueStats: (poolId: string) =>
    api.get<{
      data: RevenueStats;
    }>(`/revenue-v4/stats/${poolId}`),
};

export default api;
