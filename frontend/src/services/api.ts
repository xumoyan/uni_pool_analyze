import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
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

export default api;
