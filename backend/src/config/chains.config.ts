/**
 * 多链配置
 * 从环境变量读取不同链的配置信息
 * 
 * 使用说明：
 * 1. 在 .env 中配置不同链的 RPC URL 和合约地址
 * 2. 系统根据池子的 chainId 动态选择对应的配置
 * 3. 支持的链: 1 = Ethereum Mainnet, 130 = Unichain
 */

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockTime: number; // 区块时间（秒）
  factoryAddress?: string; // V3 Factory
  poolManagerAddress?: string; // V4 PoolManager
  positionManagerAddress?: string; // V4 Position Manager
  stateViewAddress?: string; // V4 StateView
  supportedVersions: string[]; // 支持的 Uniswap 版本
}

/**
 * 从环境变量构建链配置
 */
function buildChainConfigs(): Record<number, ChainConfig> {
  const configs: Record<number, ChainConfig> = {};

  // Ethereum Mainnet (Chain ID: 1)
  const eth_rpc = process.env.ETHEREUM_RPC_URL || "http://10.8.6.153:2700";
  const eth_factory = process.env.ETHEREUM_FACTORY_ADDRESS || "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const eth_pool_manager = process.env.ETHEREUM_POOL_MANAGER_ADDRESS || "0x000000000004444c5dc75cB358380D2e3dE08A90";
  const eth_position_manager = process.env.ETHEREUM_POSITION_MANAGER_ADDRESS || "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e";
  const eth_state_view = process.env.ETHEREUM_STATE_VIEW_ADDRESS || "0x7ffe42c4a5deea5b0fec41c94c136cf115597227";

  configs[1] = {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcUrl: eth_rpc,
    blockTime: 12,
    factoryAddress: eth_factory,
    poolManagerAddress: eth_pool_manager,
    positionManagerAddress: eth_position_manager,
    stateViewAddress: eth_state_view,
    supportedVersions: ["v3", "v4"],
  };

  // Unichain (Chain ID: 130)
  const uni_rpc = process.env.UNICHAIN_RPC_URL || "http://10.8.6.153:2700";
  const uni_factory = process.env.UNICHAIN_FACTORY_ADDRESS || "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const uni_pool_manager = process.env.UNICHAIN_POOL_MANAGER_ADDRESS || "0x1F98400000000000000000000000000000000004";
  const uni_position_manager = process.env.UNICHAIN_POSITION_MANAGER_ADDRESS || "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e";
  const uni_state_view = process.env.UNICHAIN_STATE_VIEW_ADDRESS || "0x7ffe42c4a5deea5b0fec41c94c136cf115597227";

  configs[130] = {
    chainId: 130,
    name: "Unichain",
    rpcUrl: uni_rpc,
    blockTime: 1,
    factoryAddress: uni_factory,
    poolManagerAddress: uni_pool_manager,
    positionManagerAddress: uni_position_manager,
    stateViewAddress: uni_state_view,
    supportedVersions: ["v3", "v4"],
  };

  return configs;
}

// 导出所有链的配置
export const CHAIN_CONFIGS = buildChainConfigs();

/**
 * 根据 chainId 获取链配置
 */
export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];

  if (!config) {
    throw new Error(
      `Unsupported chain ID: ${chainId}. Please add configuration in .env file. Supported chains: ${Object.keys(CHAIN_CONFIGS).join(', ')}`
    );
  }

  return config;
}

/**
 * 获取所有支持的链 ID
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(CHAIN_CONFIGS).map(id => parseInt(id));
}
