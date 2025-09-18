import { registerAs } from "@nestjs/config";

export default registerAs("ethereum", () => ({
  rpcUrl: process.env.RPC_URL || "http://10.8.6.153:2700",
  chainId: parseInt(process.env.CHAIN_ID, 10) || 1,
  // V3 配置
  factoryAddress: process.env.FACTORY_ADDRESS || "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Uniswap V3 Factory on Ethereum mainnet
  // V4 配置
  poolManagerAddress: process.env.POOL_MANAGER_ADDRESS || "0x000000000004444c5dc75cB358380D2e3dE08A90", // Uniswap V4 PoolManager
  positionManagerAddress: process.env.POSITION_MANAGER_ADDRESS || "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e", // V4 Position Manager
  stateViewAddress: process.env.STATE_VIEW_ADDRESS || "0x7ffe42c4a5deea5b0fec41c94c136cf115597227", // V4 StateView
  // 支持的版本
  supportedVersions: (process.env.SUPPORTED_VERSIONS || "v3,v4").split(","),
}));
