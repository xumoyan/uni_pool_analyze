import { registerAs } from "@nestjs/config";
import { getChainConfig, getSupportedChainIds } from "./chains.config";

/**
 * 以太坊配置
 * 
 * 提供根据 chainId 和 version 动态获取配置的方法
 * 支持 V3 和 V4 的独立配置
 */
export default registerAs("ethereum", () => {
  // 返回配置工具函数
  return {
    // 根据 chainId 获取配置（兼容旧代码）
    getConfig: (chainId: number) => {
      const chainConfig = getChainConfig(chainId);

      return {
        chainId: chainConfig.chainId,
        chainName: chainConfig.name,
        blockTime: chainConfig.blockTime,
        rpcUrl: chainConfig.rpcUrl,
        // 🔥 向后兼容：提供旧接口
        factoryAddress: chainConfig.v3?.factoryAddress,
        poolManagerAddress: chainConfig.v4?.poolManagerAddress,
        positionManagerAddress: chainConfig.v4?.positionManagerAddress,
        stateViewAddress: chainConfig.v4?.stateViewAddress,
        supportedVersions: chainConfig.supportedVersions,
        // 新接口：分离的 V3 和 V4 配置
        v3: chainConfig.v3,
        v4: chainConfig.v4,
      };
    },

    // 🔥 新增：根据 chainId 和 version 获取特定版本的配置
    getConfigByVersion: (chainId: number, version: "v3" | "v4") => {
      const chainConfig = getChainConfig(chainId);
      
      if (version === "v3") {
        if (!chainConfig.v3) {
          throw new Error(`V3 not supported on chain ${chainId}`);
        }
        return {
          chainId: chainConfig.chainId,
          chainName: chainConfig.name,
          blockTime: chainConfig.blockTime,
          rpcUrl: chainConfig.rpcUrl,
          factoryAddress: chainConfig.v3.factoryAddress,
        };
      } else if (version === "v4") {
        if (!chainConfig.v4) {
          throw new Error(`V4 not supported on chain ${chainId}`);
        }
        return {
          chainId: chainConfig.chainId,
          chainName: chainConfig.name,
          blockTime: chainConfig.blockTime,
          rpcUrl: chainConfig.rpcUrl,
          poolManagerAddress: chainConfig.v4.poolManagerAddress,
          positionManagerAddress: chainConfig.v4.positionManagerAddress,
          stateViewAddress: chainConfig.v4.stateViewAddress,
        };
      }
      
      throw new Error(`Unsupported version: ${version}`);
    },

    // 获取所有支持的链 ID
    getSupportedChainIds: () => getSupportedChainIds(),
  };
});
