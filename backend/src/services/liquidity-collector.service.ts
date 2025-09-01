import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ethers } from "ethers";
import { Token } from "@uniswap/sdk-core";
import { Pool } from "../entities/pool.entity";
import { TickLiquidity } from "../entities/tick-liquidity.entity";
import { UniswapV3Utils } from "../utils/uniswap-v3.utils";
import { UniswapV3LiquidityCalculator } from "../utils/uniswap-v3-liquidity-calculator";
import { ConfigService } from "@nestjs/config";
import { batchFetchTicks } from "../utils/uniswap-v3-liquidity-calculator";

@Injectable()
export class LiquidityCollectorService {
  private readonly logger = new Logger(LiquidityCollectorService.name);
  private uniswapUtils: UniswapV3Utils;
  private liquidityCalculator: UniswapV3LiquidityCalculator;

  constructor(
    @InjectRepository(Pool)
    private poolRepository: Repository<Pool>,
    @InjectRepository(TickLiquidity)
    private tickLiquidityRepository: Repository<TickLiquidity>,
    private configService: ConfigService,
  ) {
    const rpcUrl = this.configService.get<string>("ethereum.rpcUrl");
    const factoryAddress = this.configService.get<string>(
      "ethereum.factoryAddress",
    );
    this.uniswapUtils = new UniswapV3Utils(rpcUrl, factoryAddress);
    this.liquidityCalculator = new UniswapV3LiquidityCalculator();
  }

  /**
   * 定时收集流动性数据
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async collectLiquidityData() {
    this.logger.log("开始收集流动性数据...");

    try {
      const pools = await this.poolRepository.find({
        where: { isActive: true },
      });

      for (const pool of pools) {
        await this.collectPoolData(pool);
      }

      this.logger.log("流动性数据收集完成");
    } catch (error) {
      this.logger.error("收集流动性数据失败:", error);
    }
  }

  /**
   * 收集单个池子的数据
   */
  async collectPoolData(pool: Pool) {
    try {
      this.logger.log(`开始收集池子 ${pool.address} 的数据`);

      // 获取池子最新状态
      const poolInfo = await this.uniswapUtils.getPoolInfo(pool.address);

      // 更新池子信息
      await this.updatePoolInfo(pool, poolInfo);

      // 使用新的流动性计算器计算总代币数量
      await this.calculateAndUpdateTotalAmounts(pool, poolInfo);

      // 扫描并存储tick数据
      await this.scanAndStoreTicks(pool, poolInfo);

      this.logger.log(`池子 ${pool.address} 数据收集完成`);
    } catch (error) {
      this.logger.error(`收集池子 ${pool.address} 数据失败:`, error);
    }
  }

  /**
   * 更新池子信息
   */
  private async updatePoolInfo(pool: Pool, poolInfo: any) {
    pool.currentTick = poolInfo.currentTick;
    pool.currentSqrtPriceX96 = poolInfo.currentSqrtPriceX96;
    pool.totalLiquidity = poolInfo.totalLiquidity;

    await this.poolRepository.save(pool);
  }

  /**
   * 使用新的流动性计算器计算总代币数量
   */
  private async calculateAndUpdateTotalAmounts(pool: Pool, poolInfo: any) {
    try {
      // 创建池子合约实例
      const poolContract = new ethers.Contract(
        pool.address,
        [
          "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
          "function liquidity() external view returns (uint128)",
          "function tickSpacing() external view returns (int24)",
          "function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
        ],
        new ethers.providers.JsonRpcProvider(
          this.configService.get<string>("ethereum.rpcUrl"),
        ),
      );

      // 使用新的计算器计算总代币数量
      const result = await this.liquidityCalculator.calculateTotalTokenAmounts(
        poolContract as any,
        pool.token0Decimals,
        pool.token1Decimals,
        887272, // 扫描全区间（Uniswap V3 最大 tick 范围）
      );

      // 更新池子的总代币数量
      pool.totalAmount0 = result.amount0.toString();
      pool.totalAmount1 = result.amount1.toString();

      await this.poolRepository.save(pool);

      this.logger.log(`池子 ${pool.address} 总代币数量计算完成:`);
      this.logger.log(`  Token0: ${result.amount0Formatted}`);
      this.logger.log(`  Token1: ${result.amount1Formatted}`);
      this.logger.log(`  处理的Ticks: ${result.ticksProcessed}`);
    } catch (error) {
      this.logger.error(`计算池子 ${pool.address} 总代币数量失败:`, error);
    }
  }

  /**
   * 扫描并存储tick数据
   */
  private async scanAndStoreTicks(pool: Pool, poolInfo: any) {
    const tickSpacing = poolInfo.tickSpacing;
    const provider = new ethers.providers.JsonRpcProvider(
      this.configService.get<string>("ethereum.rpcUrl"),
    );
    const latestBlock = await provider.getBlock("latest");

    const MIN_TICK = -887272;
    const MAX_TICK = 887272;

    // 对齐到 tick spacing 全区间扫描
    const adjustedLower = Math.floor(MIN_TICK / tickSpacing) * tickSpacing;
    const adjustedUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;

    this.logger.log(
      `扫描tick范围(全区间): ${adjustedLower} 到 ${adjustedUpper}`,
    );

    // 构造 tickList
    const tickList: number[] = [];
    for (let tick = adjustedLower; tick < MAX_TICK; tick += tickSpacing) {
      tickList.push(tick);
    }

    // 批量获取 ticks
    const abi = [
      "function ticks(int24) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
    ];
    const rpcUrl = this.configService.get<string>("ethereum.rpcUrl");
    const batchResults = await batchFetchTicks(
      pool.address,
      tickList,
      abi,
      rpcUrl,
    );

    // 用 map 缓存 tick 数据
    const tickDataMap = new Map<number, any>();
    for (let i = 0; i < tickList.length; i++) {
      tickDataMap.set(tickList[i], batchResults[i]);
    }

    // 收集所有初始化的 ticks 并排序
    const initializedTicks: { tick: number; liquidityNet: ethers.BigNumber; liquidityGross: ethers.BigNumber; initialized: boolean }[] = [];
    for (let i = 0; i < tickList.length; i++) {
      const tickData = batchResults[i];
      if (tickData.initialized) {
        initializedTicks.push({
          tick: tickList[i],
          liquidityNet: ethers.BigNumber.from(tickData.liquidityNet.toString()),
          liquidityGross: ethers.BigNumber.from(tickData.liquidityGross.toString()),
          initialized: true,
        });
      }
    }
    initializedTicks.sort((a, b) => a.tick - b.tick);

    // 区间 token 数量计算
    const tickDataArray: any[] = [];
    let activeLiquidity = ethers.BigNumber.from(0);
    for (let i = 1; i < initializedTicks.length; i++) {
      // 累加前一个 tick 的 liquidityNet
      activeLiquidity = activeLiquidity.add(initializedTicks[i - 1].liquidityNet);
      if (activeLiquidity.lte(0)) continue;
      const tickLower = initializedTicks[i - 1].tick;
      const tickUpper = initializedTicks[i].tick;
      // 计算区间价格（用 tickLower）
      const token0 = new Token(
        this.configService.get<number>("ethereum.chainId"),
        pool.token0Address,
        pool.token0Decimals,
        pool.token0Symbol,
        pool.token0Symbol
      );
      const token1 = new Token(
        this.configService.get<number>("ethereum.chainId"),
        pool.token1Address,
        pool.token1Decimals,
        pool.token1Symbol,
        pool.token1Symbol,
      );
      const price = this.uniswapUtils.calculateTickPrice(tickLower, token0, token1);
      const { amount0, amount1 } = this.liquidityCalculator.calculateTokenAmountsInRange(
        activeLiquidity,
        tickLower,
        tickUpper,
        poolInfo.currentTick,
        ethers.BigNumber.from(poolInfo.currentSqrtPriceX96),
      );
      tickDataArray.push({
        poolAddress: pool.address,
        tick: tickLower,
        price,
        liquidityGross: initializedTicks[i - 1].liquidityGross.toString(),
        liquidityNet: initializedTicks[i - 1].liquidityNet.toString(),
        initialized: true,
        token0Amount: amount0.toString(),
        token1Amount: amount1.toString(),
        token0AmountFormatted: this.uniswapUtils.formatTokenAmount(amount0, pool.token0Decimals),
        token1AmountFormatted: this.uniswapUtils.formatTokenAmount(amount1, pool.token1Decimals),
        blockNumber: latestBlock.number,
        blockTimestamp: new Date(latestBlock.timestamp * 1000),
      });
    }

    if (tickDataArray.length > 0) {
      await this.insertTickLiquidity(tickDataArray);
      this.logger.log(
        `成功存储 ${tickDataArray.length} 条tick数据 (区块 ${latestBlock.number})`,
      );
    }
  }

  /**
   * 批量更新或插入tick流动性数据
   */
  private async insertTickLiquidity(tickDataArray: any[]) {
    try {
      // 逐条插入，保留历史（不使用唯一键约束）
      await this.tickLiquidityRepository.save(tickDataArray);
    } catch (error) {
      this.logger.error("批量插入tick数据失败:", error);
      throw error;
    }
  }

  /**
     * 获取池子所有 tick 数据（最新块，最大 10000 条）
     */
  async getAllPoolLiquidity(poolAddress: string) {
    // 获取最新块
    const latest = await this.tickLiquidityRepository
      .createQueryBuilder('tick')
      .select('MAX(tick.blockNumber)', 'max_block')
      .where('tick.poolAddress = :poolAddress', { poolAddress })
      .getRawOne();
    const selectedBlock = latest?.max_block ?? null;

    const qb = this.tickLiquidityRepository
      .createQueryBuilder('tick')
      .where('tick.poolAddress = :poolAddress', { poolAddress });
    if (selectedBlock !== null) {
      qb.andWhere('tick.blockNumber = :block', { block: selectedBlock });
    }
    const [data, total] = await qb
      .orderBy('tick.tick', 'ASC')
      .take(10000)
      .skip(0)
      .getManyAndCount();
    return {
      data,
      total,
      block: selectedBlock,
      limit: 10000,
      offset: 0,
    };
  }

  /**
   * 手动触发数据收集
   */
  async manualCollect(poolAddress: string) {
    const pool = await this.poolRepository.findOne({
      where: { address: poolAddress },
    });
    if (!pool) {
      throw new Error("Pool not found");
    }

    this.collectPoolData(pool);

    return {
      data: [],
      message: "Data collection triggered",
    }
  }
}
