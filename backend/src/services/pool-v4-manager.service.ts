import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PoolV4 } from "../entities/pool-v4.entity";
import { UniswapV4Utils, PoolKey } from "../utils/uniswap-v4.utils";
import { ConfigService } from "@nestjs/config";

export interface CreatePoolV4Dto {
  token0Address: string;
  token1Address: string;
  feeTier: number;
  tickSpacing: number;
  hooksAddress?: string;
  chainId: number; // 新增：指定池子所在的链
}

@Injectable()
export class PoolV4ManagerService {
  private readonly logger = new Logger(PoolV4ManagerService.name);

  constructor(
    @InjectRepository(PoolV4)
    private poolV4Repository: Repository<PoolV4>,
    private configService: ConfigService,
  ) { }

  /**
   * 根据 chainId 获取 UniswapV4Utils 实例
   */
  private getUniswapV4Utils(chainId: number): UniswapV4Utils {
    const getConfig = this.configService.get<Function>("ethereum.getConfig");
    const config = getConfig(chainId);

    return new UniswapV4Utils(config.rpcUrl, config.poolManagerAddress);
  }

  /**
   * 创建新的 V4 池子
   */
  async createPoolV4(createPoolDto: CreatePoolV4Dto): Promise<PoolV4> {
    try {
      const { chainId } = createPoolDto;

      this.logger.log(
        `创建新的 V4 池子 (Chain ${chainId}): ${createPoolDto.token0Address} - ${createPoolDto.token1Address}, 费率: ${createPoolDto.feeTier}`
      );

      // 根据 chainId 获取工具类
      const uniswapV4Utils = this.getUniswapV4Utils(chainId);
      const getConfig = this.configService.get<Function>("ethereum.getConfig");
      const config = getConfig(chainId);

      // 创建 PoolKey
      const poolKey = uniswapV4Utils.createPoolKey(
        createPoolDto.token0Address,
        createPoolDto.token1Address,
        createPoolDto.feeTier,
        createPoolDto.tickSpacing,
        createPoolDto.hooksAddress
      );

      // 计算 PoolId
      const poolId = uniswapV4Utils.calculatePoolId(poolKey);

      // 检查池子是否已存在
      const existingPool = await this.poolV4Repository.findOne({
        where: { poolId, chainId },
      });

      if (existingPool) {
        throw new Error("Pool already exists");
      }

      // 尝试获取池子信息，如果失败则使用默认值
      let poolInfo;
      try {
        poolInfo = await uniswapV4Utils.getPoolInfo(poolKey);
      } catch (error) {
        this.logger.warn(`无法获取链上池子信息，使用默认值: ${error.message}`);
        poolInfo = {
          poolId: poolId,
          poolKey: poolKey,
          currentTick: 0,
          tickSpacing: createPoolDto.tickSpacing,
          totalLiquidity: "0",
          currentSqrtPriceX96: "79228162514264337593543950336", // 默认价格 (1:1)
          protocolFee: 0,
          lpFee: createPoolDto.feeTier,
        };
      }

      // 尝试获取代币信息，如果失败则使用默认值
      let token0Info, token1Info;
      try {
        [token0Info, token1Info] = await Promise.all([
          uniswapV4Utils.getTokenInfo(poolKey.currency0),
          uniswapV4Utils.getTokenInfo(poolKey.currency1),
        ]);
      } catch (error) {
        this.logger.warn(`无法获取代币信息，使用默认值: ${error.message}`);

        // 🔥 修复：为已知代币提供正确的信息
        token0Info = this.getKnownTokenInfo(poolKey.currency0);
        token1Info = this.getKnownTokenInfo(poolKey.currency1);
      }

      // 创建池子记录
      const pool = this.poolV4Repository.create({
        poolId: poolInfo.poolId,
        token0Address: poolKey.currency0,
        token1Address: poolKey.currency1,
        token0Symbol: token0Info.symbol,
        token1Symbol: token1Info.symbol,
        token0Decimals: token0Info.decimals,
        token1Decimals: token1Info.decimals,
        feeTier: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooksAddress: poolKey.hooks,
        poolManagerAddress: config.poolManagerAddress,
        currentTick: poolInfo.currentTick,
        currentSqrtPriceX96: poolInfo.currentSqrtPriceX96,
        totalLiquidity: poolInfo.totalLiquidity,
        isActive: true,
        version: "v4",
        chainId: chainId,
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
      });

      const savedPool = await this.poolV4Repository.save(pool);
      this.logger.log(`V4 池子创建成功 (Chain ${chainId}): ${poolId}`);

      return savedPool;
    } catch (error) {
      this.logger.error("创建 V4 池子失败:", error);
      throw error;
    }
  }

  /**
   * 获取已知代币的正确信息
   */
  private getKnownTokenInfo(address: string): any {
    // 已知代币信息映射
    const knownTokens = {
      // ETH 地址
      '0x0000000000000000000000000000000000000000': {
        address: address,
        decimals: 18,
        symbol: 'ETH',
        name: 'Ethereum',
      },
      // WETH
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': {
        address: address,
        decimals: 18,
        symbol: 'WETH',
        name: 'Wrapped Ether',
      },
      // USDT
      '0xdAC17F958D2ee523a2206206994597C13D831ec7': {
        address: address,
        decimals: 6, // 🔥 正确的 USDT decimals
        symbol: 'USDT',
        name: 'Tether USD',
      },
      // USDC
      '0xA0b86a33E6417c5CE89C5C8C6E0b8E2F7D8C4a8c': {
        address: address,
        decimals: 6,
        symbol: 'USDC',
        name: 'USD Coin',
      },
      // DAI
      '0x6B175474E89094C44Da98b954EedeAC495271d0F': {
        address: address,
        decimals: 18,
        symbol: 'DAI',
        name: 'Dai Stablecoin',
      },
      // 🔥 用户添加的代币
      '0x9151434b16b9763660705744891fa906f660ecc5': {
        address: address,
        decimals: 6,
        symbol: 'USDT', // 根据你的描述，这应该是USDT
        name: 'Tether USD',
      }
    };

    // 检查是否为已知代币
    const knownToken = knownTokens[address.toLowerCase()] || knownTokens[address];

    if (knownToken) {
      this.logger.log(`使用已知代币信息: ${knownToken.symbol} (${knownToken.decimals} decimals)`);
      return knownToken;
    }

    // 未知代币使用默认值
    this.logger.warn(`未知代币 ${address}，使用默认值`);
    return {
      address: address,
      decimals: 18, // 默认 18 decimals
      symbol: `TOKEN_${address.slice(-4)}`,
      name: `Unknown Token`,
    };
  }

  /**
   * 获取所有 V4 池子
   */
  async getAllPoolsV4(): Promise<PoolV4[]> {
    return this.poolV4Repository.find({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * 根据 PoolId 获取池子
   */
  async getPoolByPoolId(poolId: string): Promise<PoolV4> {
    const pool = await this.poolV4Repository.findOne({
      where: { poolId, isActive: true },
    });

    if (!pool) {
      throw new Error("Pool not found");
    }

    return pool;
  }

  /**
   * 根据代币地址、费率和 hooks 查找池子
   */
  async findPoolByTokensAndHooks(
    token0Address: string,
    token1Address: string,
    feeTier: number,
    tickSpacing: number,
    chainId: number,
    hooksAddress?: string
  ): Promise<PoolV4 | null> {
    try {
      const uniswapV4Utils = this.getUniswapV4Utils(chainId);
      const poolKey = uniswapV4Utils.createPoolKey(
        token0Address,
        token1Address,
        feeTier,
        tickSpacing,
        hooksAddress
      );

      const poolId = uniswapV4Utils.calculatePoolId(poolKey);

      return this.poolV4Repository.findOne({
        where: { poolId, chainId, isActive: true },
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * 更新池子状态
   */
  async updatePoolStatus(poolId: string, isActive: boolean): Promise<PoolV4> {
    const pool = await this.getPoolByPoolId(poolId);
    pool.isActive = isActive;
    return this.poolV4Repository.save(pool);
  }

  /**
   * 删除池子
   */
  async deletePool(poolId: string): Promise<void> {
    const pool = await this.getPoolByPoolId(poolId);
    await this.poolV4Repository.remove(pool);
  }

  /**
   * 获取池子统计信息
   */
  async getPoolStats(poolId: string) {
    const pool = await this.getPoolByPoolId(poolId);

    // 获取tick数量统计
    const tickCount = await this.poolV4Repository
      .createQueryBuilder("pool")
      .leftJoin("pool.tickLiquidities", "tick")
      .where("pool.poolId = :poolId", { poolId })
      .getCount();

    return {
      pool,
      tickCount,
      lastUpdated: pool.updatedAt,
    };
  }

  /**
   * 根据 PoolKey 计算 PoolId
   */
  calculatePoolId(poolKey: PoolKey, chainId: number): string {
    const uniswapV4Utils = this.getUniswapV4Utils(chainId);
    return uniswapV4Utils.calculatePoolId(poolKey);
  }

  /**
   * 创建 PoolKey
   */
  createPoolKey(
    token0Address: string,
    token1Address: string,
    feeTier: number,
    tickSpacing: number,
    chainId: number,
    hooksAddress?: string
  ): PoolKey {
    const uniswapV4Utils = this.getUniswapV4Utils(chainId);
    return uniswapV4Utils.createPoolKey(
      token0Address,
      token1Address,
      feeTier,
      tickSpacing,
      hooksAddress
    );
  }
}
