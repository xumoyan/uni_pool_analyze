/**
 * 多链配置
 * 从环境变量读取不同链和版本的配置信息
 * 
 * 使用说明：
 * 1. 在 .env 中配置不同链的 RPC URL 和合约地址（区分 V3 和 V4）
 * 2. 系统根据池子的 chainId 和 version 动态选择对应的配置
 * 3. 支持的链: 1 = Ethereum Mainnet, 130 = Unichain
 * 4. 支持的版本: v3, v4
 * 
 * 环境变量命名规则：
 * - Ethereum V3: ETHEREUM_V3_FACTORY_ADDRESS, ETHEREUM_V3_POOL_MANAGER_ADDRESS
 * - Ethereum V4: ETHEREUM_V4_POOL_MANAGER_ADDRESS, ETHEREUM_V4_STATE_VIEW_ADDRESS
 * - Unichain V3: UNICHAIN_V3_FACTORY_ADDRESS
 * - Unichain V4: UNICHAIN_V4_POOL_MANAGER_ADDRESS, UNICHAIN_V4_STATE_VIEW_ADDRESS
 */

export interface V3Config {
  factoryAddress?: string; // V3 Factory 地址
}

export interface V4Config {
  poolManagerAddress?: string; // V4 PoolManager 地址
  positionManagerAddress?: string; // V4 Position Manager 地址
  stateViewAddress?: string; // V4 StateView 地址
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  blockTime: number; // 区块时间（秒）
  v3?: V3Config; // V3 配置
  v4?: V4Config; // V4 配置
  supportedVersions: string[]; // 支持的 Uniswap 版本
}

/**
 * 从环境变量构建链配置（区分 V3 和 V4）
 */
function buildChainConfigs(): Record<number, ChainConfig> {
  const configs: Record<number, ChainConfig> = {};

  // Ethereum Mainnet (Chain ID: 1)
  const eth_rpc = process.env.ETHEREUM_RPC_URL || "http://10.8.6.153:2700";

  // V3 配置
  const eth_v3_factory = process.env.ETHEREUM_V3_FACTORY_ADDRESS;

  // V4 配置
  const eth_v4_pool_manager = process.env.ETHEREUM_V4_POOL_MANAGER_ADDRESS;
  const eth_v4_position_manager = process.env.ETHEREUM_V4_POSITION_MANAGER_ADDRESS;
  const eth_v4_state_view = process.env.ETHEREUM_V4_STATE_VIEW_ADDRESS;

  // 构建支持的版本列表
  const ethSupportedVersions: string[] = [];
  if (eth_v3_factory) ethSupportedVersions.push("v3");
  if (eth_v4_pool_manager) ethSupportedVersions.push("v4");

  configs[1] = {
    chainId: 1,
    name: "Ethereum Mainnet",
    rpcUrl: eth_rpc,
    blockTime: 12,
    v3: eth_v3_factory ? {
      factoryAddress: eth_v3_factory,
    } : undefined,
    v4: (eth_v4_pool_manager || eth_v4_position_manager || eth_v4_state_view) ? {
      poolManagerAddress: eth_v4_pool_manager,
      positionManagerAddress: eth_v4_position_manager,
      stateViewAddress: eth_v4_state_view,
    } : undefined,
    supportedVersions: ethSupportedVersions.length > 0 ? ethSupportedVersions : ["v3", "v4"],
  };

  // Unichain (Chain ID: 130)
  const uni_rpc = process.env.UNICHAIN_RPC_URL || "https://mainnet.unichain.org";

  // V3 配置（如果有）
  const uni_v3_factory = process.env.UNICHAIN_V3_FACTORY_ADDRESS;

  // V4 配置
  const uni_v4_pool_manager = process.env.UNICHAIN_V4_POOL_MANAGER_ADDRESS || "0x1F98400000000000000000000000000000000004";
  const uni_v4_position_manager = process.env.UNICHAIN_V4_POSITION_MANAGER_ADDRESS || "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e";
  // 🔥 修复：Unichain 的正确 StateView 地址应该是 0x86e8631a016f9068c3f085faf484ee3f5fdee8f2
  const uni_v4_state_view = process.env.UNICHAIN_V4_STATE_VIEW_ADDRESS || "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2";

  // 构建支持的版本列表
  const uniSupportedVersions: string[] = [];
  if (uni_v3_factory) uniSupportedVersions.push("v3");
  if (uni_v4_pool_manager) uniSupportedVersions.push("v4");

  configs[130] = {
    chainId: 130,
    name: "Unichain",
    rpcUrl: uni_rpc,
    blockTime: 1,
    v3: uni_v3_factory ? {
      factoryAddress: uni_v3_factory,
    } : undefined,
    v4: (uni_v4_pool_manager || uni_v4_position_manager || uni_v4_state_view) ? {
      poolManagerAddress: uni_v4_pool_manager,
      positionManagerAddress: uni_v4_position_manager,
      stateViewAddress: uni_v4_state_view,
    } : undefined,
    supportedVersions: uniSupportedVersions.length > 0 ? uniSupportedVersions : ["v4"],
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

/**
 * 🔥 新增：根据 chainId 和 version 获取特定版本的配置
 * @param chainId 链 ID
 * @param version 版本 ("v3" | "v4")
 * @returns 版本特定的配置
 */
export function getVersionConfig(chainId: number, version: "v3" | "v4"): V3Config | V4Config {
  const config = getChainConfig(chainId);

  if (version === "v3") {
    if (!config.v3) {
      throw new Error(`V3 not configured for chain ${chainId}`);
    }
    return config.v3;
  } else if (version === "v4") {
    if (!config.v4) {
      throw new Error(`V4 not configured for chain ${chainId}`);
    }
    return config.v4;
  }

  throw new Error(`Unsupported version: ${version}`);
}
