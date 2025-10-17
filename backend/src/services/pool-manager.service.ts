import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Pool } from "../entities/pool.entity";
import { UniswapV3Utils } from "../utils/uniswap-v3.utils";
import { ConfigService } from "@nestjs/config";

export interface CreatePoolDto {
  token0Address: string;
  token1Address: string;
  feeTier: number;
  chainId: number; // 新增：指定池子所在的链
}

@Injectable()
export class PoolManagerService {
  private readonly logger = new Logger(PoolManagerService.name);

  constructor(
    @InjectRepository(Pool)
    private poolRepository: Repository<Pool>,
    private configService: ConfigService,
  ) { }

  /**
   * 根据 chainId 获取 UniswapV3Utils 实例
   */
  private getUniswapUtils(chainId: number): UniswapV3Utils {
    const getConfig = this.configService.get<Function>("ethereum.getConfig");
    const config = getConfig(chainId);

    return new UniswapV3Utils(config.rpcUrl, config.factoryAddress);
  }

  /**
   * 创建新池子
   */
  async createPool(createPoolDto: CreatePoolDto): Promise<Pool> {
    try {
      const { chainId } = createPoolDto;

      this.logger.log(
        `创建新池子 (Chain ${chainId}): ${createPoolDto.token0Address} - ${createPoolDto.token1Address}, 费率: ${createPoolDto.feeTier}`,
      );

      // 根据 chainId 获取工具类
      const uniswapUtils = this.getUniswapUtils(chainId);

      // 获取池子地址
      const poolAddress = await uniswapUtils.getPoolAddress(
        createPoolDto.token0Address,
        createPoolDto.token1Address,
        createPoolDto.feeTier,
      );

      // 检查池子是否已存在
      const existingPool = await this.poolRepository.findOne({
        where: { address: poolAddress, chainId },
      });

      if (existingPool) {
        throw new Error("Pool already exists");
      }

      // 获取池子信息
      const poolInfo = await uniswapUtils.getPoolInfo(poolAddress);

      // 获取代币信息
      const [token0Info, token1Info] = await Promise.all([
        uniswapUtils.getTokenInfo(createPoolDto.token0Address),
        uniswapUtils.getTokenInfo(createPoolDto.token1Address),
      ]);

      // 创建池子记录
      const pool = this.poolRepository.create({
        address: poolAddress,
        token0Address: poolInfo.token0Address,
        token1Address: poolInfo.token1Address,
        token0Symbol: token0Info.symbol,
        token1Symbol: token1Info.symbol,
        token0Decimals: token0Info.decimals,
        token1Decimals: token1Info.decimals,
        feeTier: createPoolDto.feeTier,
        tickSpacing: poolInfo.tickSpacing,
        currentTick: poolInfo.currentTick,
        currentSqrtPriceX96: poolInfo.currentSqrtPriceX96,
        totalLiquidity: poolInfo.totalLiquidity,
        isActive: true,
        chainId: chainId,
      });

      const savedPool = await this.poolRepository.save(pool);
      this.logger.log(`池子创建成功 (Chain ${chainId}): ${poolAddress}`);

      return savedPool;
    } catch (error) {
      this.logger.error("创建池子失败:", error);
      throw error;
    }
  }

  /**
   * 获取所有池子
   */
  async getAllPools(): Promise<Pool[]> {
    return this.poolRepository.find({
      where: { isActive: true },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * 根据地址获取池子
   */
  async getPoolByAddress(address: string): Promise<Pool> {
    const pool = await this.poolRepository.findOne({
      where: { address, isActive: true },
    });

    if (!pool) {
      throw new Error("Pool not found");
    }

    return pool;
  }

  /**
   * 根据代币地址和费率查找池子
   */
  async findPoolByTokens(
    token0Address: string,
    token1Address: string,
    feeTier: number,
    chainId: number,
  ): Promise<Pool | null> {
    try {
      const uniswapUtils = this.getUniswapUtils(chainId);
      const poolAddress = await uniswapUtils.getPoolAddress(
        token0Address,
        token1Address,
        feeTier,
      );

      return this.poolRepository.findOne({
        where: { address: poolAddress, chainId, isActive: true },
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * 更新池子状态
   */
  async updatePoolStatus(address: string, isActive: boolean): Promise<Pool> {
    const pool = await this.getPoolByAddress(address);
    pool.isActive = isActive;
    return this.poolRepository.save(pool);
  }

  /**
   * 删除池子
   */
  async deletePool(address: string): Promise<void> {
    const pool = await this.getPoolByAddress(address);
    await this.poolRepository.remove(pool);
  }

  /**
   * 获取池子统计信息
   */
  async getPoolStats(address: string) {
    const pool = await this.getPoolByAddress(address);

    // 获取tick数量统计
    const tickCount = await this.poolRepository
      .createQueryBuilder("pool")
      .leftJoin("pool.tickLiquidities", "tick")
      .where("pool.address = :address", { address })
      .getCount();

    return {
      pool,
      tickCount,
      lastUpdated: pool.updatedAt,
    };
  }
}
