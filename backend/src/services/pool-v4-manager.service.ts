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
}

@Injectable()
export class PoolV4ManagerService {
  private readonly logger = new Logger(PoolV4ManagerService.name);
  private uniswapV4Utils: UniswapV4Utils;

  constructor(
    @InjectRepository(PoolV4)
    private poolV4Repository: Repository<PoolV4>,
    private configService: ConfigService,
  ) {
    const rpcUrl = this.configService.get<string>("ethereum.rpcUrl");
    const poolManagerAddress = this.configService.get<string>("ethereum.poolManagerAddress");
    this.uniswapV4Utils = new UniswapV4Utils(rpcUrl, poolManagerAddress);
  }

  /**
   * 创建新的 V4 池子
   */
  async createPoolV4(createPoolDto: CreatePoolV4Dto): Promise<PoolV4> {
    try {
      this.logger.log(
        `创建新的 V4 池子: ${createPoolDto.token0Address} - ${createPoolDto.token1Address}, 费率: ${createPoolDto.feeTier}`
      );

      // 创建 PoolKey
      const poolKey = this.uniswapV4Utils.createPoolKey(
        createPoolDto.token0Address,
        createPoolDto.token1Address,
        createPoolDto.feeTier,
        createPoolDto.tickSpacing,
        createPoolDto.hooksAddress
      );

      // 计算 PoolId
      const poolId = this.uniswapV4Utils.calculatePoolId(poolKey);

      // 检查池子是否已存在
      const existingPool = await this.poolV4Repository.findOne({
        where: { poolId },
      });

      if (existingPool) {
        throw new Error("Pool already exists");
      }

      // 尝试获取池子信息，如果失败则使用默认值
      let poolInfo;
      try {
        poolInfo = await this.uniswapV4Utils.getPoolInfo(poolKey);
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
          this.uniswapV4Utils.getTokenInfo(poolKey.currency0),
          this.uniswapV4Utils.getTokenInfo(poolKey.currency1),
        ]);
      } catch (error) {
        this.logger.warn(`无法获取代币信息，使用默认值: ${error.message}`);
        token0Info = {
          address: poolKey.currency0,
          decimals: 18,
          symbol: `TOKEN0_${poolKey.currency0.slice(-4)}`,
          name: `Token0`,
        };
        token1Info = {
          address: poolKey.currency1,
          decimals: 18,
          symbol: `TOKEN1_${poolKey.currency1.slice(-4)}`,
          name: `Token1`,
        };
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
        poolManagerAddress: this.configService.get<string>("ethereum.poolManagerAddress"),
        currentTick: poolInfo.currentTick,
        currentSqrtPriceX96: poolInfo.currentSqrtPriceX96,
        totalLiquidity: poolInfo.totalLiquidity,
        isActive: true,
        version: "v4",
        chainId: this.configService.get<number>("ethereum.chainId"),
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
      });

      const savedPool = await this.poolV4Repository.save(pool);
      this.logger.log(`V4 池子创建成功: ${poolId}`);

      return savedPool;
    } catch (error) {
      this.logger.error("创建 V4 池子失败:", error);
      throw error;
    }
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
    hooksAddress?: string
  ): Promise<PoolV4 | null> {
    try {
      const poolKey = this.uniswapV4Utils.createPoolKey(
        token0Address,
        token1Address,
        feeTier,
        tickSpacing,
        hooksAddress
      );

      const poolId = this.uniswapV4Utils.calculatePoolId(poolKey);

      return this.poolV4Repository.findOne({
        where: { poolId, isActive: true },
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
  calculatePoolId(poolKey: PoolKey): string {
    return this.uniswapV4Utils.calculatePoolId(poolKey);
  }

  /**
   * 创建 PoolKey
   */
  createPoolKey(
    token0Address: string,
    token1Address: string,
    feeTier: number,
    tickSpacing: number,
    hooksAddress?: string
  ): PoolKey {
    return this.uniswapV4Utils.createPoolKey(
      token0Address,
      token1Address,
      feeTier,
      tickSpacing,
      hooksAddress
    );
  }
}
