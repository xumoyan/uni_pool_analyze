import { registerAs } from "@nestjs/config";
import { getChainConfig, getSupportedChainIds } from "./chains.config";

/**
 * 以太坊配置
 * 
 * 提供根据 chainId 动态获取配置的方法
 * 不再使用全局的 CURRENT_CHAIN_ID
 */
export default registerAs("ethereum", () => {
  // 返回配置工具函数
  return {
    // 根据 chainId 获取配置
    getConfig: (chainId: number) => {
      const chainConfig = getChainConfig(chainId);

      return {
        chainId: chainConfig.chainId,
        chainName: chainConfig.name,
        blockTime: chainConfig.blockTime,
        rpcUrl: chainConfig.rpcUrl,
        factoryAddress: chainConfig.factoryAddress,
        poolManagerAddress: chainConfig.poolManagerAddress,
        positionManagerAddress: chainConfig.positionManagerAddress,
        stateViewAddress: chainConfig.stateViewAddress,
        supportedVersions: chainConfig.supportedVersions,
      };
    },

    // 获取所有支持的链 ID
    getSupportedChainIds: () => getSupportedChainIds(),
  };
});
