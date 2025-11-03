import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ethers } from "ethers";
import { Token } from "@uniswap/sdk-core";
import { PoolV4 } from "../entities/pool-v4.entity";
import { PoolDailyRevenue } from "../entities/pool-daily-revenue.entity";
import { UniswapV4Utils } from "../utils/uniswap-v4.utils";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PoolV4RevenueCollectorService {
  private readonly logger = new Logger(PoolV4RevenueCollectorService.name);

  constructor(
    @InjectRepository(PoolV4)
    private poolV4Repository: Repository<PoolV4>,
    @InjectRepository(PoolDailyRevenue)
    private poolDailyRevenueRepository: Repository<PoolDailyRevenue>,
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
   * 根据 chainId 获取 StateView 合约实例
   */
  private getStateViewContract(chainId: number): ethers.Contract {
    const getConfig = this.configService.get<Function>("ethereum.getConfig");
    const config = getConfig(chainId);

    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    const stateViewABI = [
      "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
      "function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)",
      "function getFeeGrowthGlobals(bytes32 poolId) external view returns (uint256 feeGrowthGlobal0X128, uint256 feeGrowthGlobal1X128)",
    ];

    return new ethers.Contract(config.stateViewAddress, stateViewABI, provider);
  }

  /**
   * 根据 chainId 获取配置
   */
  private getChainConfig(chainId: number) {
    const getConfig = this.configService.get<Function>("ethereum.getConfig");
    return getConfig(chainId);
  }

  /**
   * 定时收集 V4 每日收益数据 - 使用智能收集策略
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM) // 避免与V3收集时间冲突
  async collectV4DailyRevenue() {
    this.logger.log("开始智能收集 V4 每日收益数据...");

    try {
      const pools = await this.poolV4Repository.find({
        where: { isActive: true },
      });

      this.logger.log(`找到 ${pools.length} 个活跃的 V4 池子`);

      for (const pool of pools) {
        this.logger.log(`处理池子: ${pool.token0Symbol}-${pool.token1Symbol}`);
        try {
          // 使用智能收集逻辑：如果没有数据收集30天，如果有数据从最新往后收集
          await this.collectPoolDailyRevenue(pool.poolId);
        } catch (error) {
          this.logger.error(`收集池子 ${pool.poolId} 数据失败: ${error.message}`);
          // 继续处理其他池子，不要因为一个池子失败就停止
        }
      }

      this.logger.log("V4 每日收益数据智能收集完成");
    } catch (error) {
      this.logger.error("收集 V4 每日收益数据失败:", error);
    }
  }

  /**
   * 批量收集所有 V4 池子的历史收益数据
   */
  async collectAllV4PoolsHistoricalRevenue(days: number = 30) {
    this.logger.log(`开始收集所有 V4 池子过去 ${days} 天的历史收益数据...`);

    try {
      const pools = await this.poolV4Repository.find({
        where: { isActive: true },
      });

      this.logger.log(`找到 ${pools.length} 个活跃的 V4 池子`);

      const results = [];
      for (const pool of pools) {
        this.logger.log(`处理池子: ${pool.token0Symbol}-${pool.token1Symbol} (${pool.poolId.substring(0, 10)}...)`);

        try {
          const result = await this.collectPoolHistoricalRevenue(pool.poolId, days);
          results.push(result);
        } catch (error) {
          this.logger.error(`收集池子 ${pool.poolId} 历史数据失败: ${error.message}`);
          results.push({
            poolId: pool.poolId,
            totalDays: days,
            successCount: 0,
            failureCount: days,
            error: error.message
          });
        }
      }

      const totalSuccess = results.reduce((sum, r) => sum + (r.successCount || 0), 0);
      const totalDays = results.length * days;

      this.logger.log(`所有 V4 池子历史数据收集完成: ${totalSuccess}/${totalDays} 天成功`);

      return {
        totalPools: pools.length,
        totalDays,
        totalSuccess,
        totalFailure: totalDays - totalSuccess,
        results
      };
    } catch (error) {
      this.logger.error("收集所有 V4 池子历史收益数据失败:", error);
      throw error;
    }
  }

  /**
   * 批量收集 V4 池子的历史收益数据（过去30天）
   */
  async collectPoolHistoricalRevenue(poolId: string, days: number = 30) {
    try {
      const pool = await this.poolV4Repository.findOne({
        where: { poolId },
      });

      if (!pool) {
        throw new Error(`V4 Pool ${poolId} not found`);
      }

      this.logger.log(`开始收集 V4 池子 ${poolId} 过去 ${days} 天的历史收益数据`);

      const results = [];
      const today = new Date();

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0];

        try {
          const result = await this.collectPoolDailyRevenue(poolId, dateString);
          results.push({ date: dateString, success: true, data: result });
        } catch (error) {
          this.logger.warn(`收集 ${dateString} 数据失败: ${error.message}`);
          results.push({ date: dateString, success: false, error: error.message });
        }

        // 添加小延迟避免过于频繁的请求
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const successCount = results.filter(r => r.success).length;
      this.logger.log(`V4 池子 ${poolId} 历史数据收集完成: ${successCount}/${days} 天成功`);

      return {
        poolId,
        totalDays: days,
        successCount,
        failureCount: days - successCount,
        results
      };
    } catch (error) {
      this.logger.error(`收集 V4 池子 ${poolId} 历史收益数据失败:`, error);
      throw error;
    }
  }

  /**
   * 🔥 智能收集V4池子收益数据：
   * - 如果数据库没有数据，收集最近30天
   * - 如果有数据，从最新数据往后收集到今天
   */
  async collectPoolDailyRevenue(poolId: string, targetDate?: string) {
    try {
      const pool = await this.poolV4Repository.findOne({
        where: { poolId },
      });

      if (!pool) {
        throw new Error(`V4 Pool ${poolId} not found`);
      }

      // 如果指定了特定日期，只收集那一天的数据
      if (targetDate) {
        return await this.collectSingleDayRevenue(poolId, targetDate);
      }

      // 🔥 智能收集逻辑
      this.logger.log(`开始智能收集 V4 池子 ${poolId} 的收益数据`);

      // 查找该池子最新的收益数据
      const latestData = await this.poolDailyRevenueRepository.findOne({
        where: { poolAddress: poolId },
        order: { date: 'DESC' }
      });

      const today = new Date().toISOString().split('T')[0];
      let startDate: string;
      let daysToCollect: number;

      if (!latestData) {
        // 数据库没有数据，收集最近30天
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        startDate = thirtyDaysAgo.toISOString().split('T')[0];
        daysToCollect = 30;
        this.logger.log(`数据库无数据，收集最近30天数据 (${startDate} 到 ${today})`);
      } else {
        // 有数据，从最新数据的下一天开始收集到今天
        const nextDay = new Date(latestData.date);
        nextDay.setDate(nextDay.getDate() + 1);
        startDate = nextDay.toISOString().split('T')[0];

        // 计算需要收集的天数
        const startTime = new Date(startDate).getTime();
        const todayTime = new Date(today).getTime();
        daysToCollect = Math.ceil((todayTime - startTime) / (24 * 60 * 60 * 1000)) + 1;

        if (daysToCollect <= 0) {
          this.logger.log(`V4 池子 ${poolId} 数据已是最新，无需收集`);
          return latestData;
        }

        this.logger.log(`从最新数据 ${latestData.date} 之后开始收集，需要收集 ${daysToCollect} 天数据 (${startDate} 到 ${today})`);
      }

      // 批量收集数据
      const results = [];
      const startDateObj = new Date(startDate);

      for (let i = 0; i < daysToCollect; i++) {
        const currentDate = new Date(startDateObj);
        currentDate.setDate(startDateObj.getDate() + i);
        const dateString = currentDate.toISOString().split('T')[0];

        // 不要收集未来的日期
        if (dateString > today) {
          break;
        }

        try {
          const result = await this.collectSingleDayRevenue(poolId, dateString);
          results.push({ date: dateString, success: true, data: result });
          this.logger.log(`✅ 收集 ${dateString} 数据成功`);
        } catch (error) {
          this.logger.warn(`❌ 收集 ${dateString} 数据失败: ${error.message}`);
          results.push({ date: dateString, success: false, error: error.message });
        }

        // 添加小延迟避免过于频繁的请求
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const successCount = results.filter(r => r.success).length;
      this.logger.log(`V4 池子 ${poolId} 智能收集完成: ${successCount}/${results.length} 天成功`);

      // 返回最新的数据
      const successResults = results.filter(r => r.success);
      return successResults.length > 0 ? successResults[successResults.length - 1].data : latestData;

    } catch (error) {
      this.logger.error(`智能收集 V4 池子 ${poolId} 收益数据失败:`, error);
      throw error;
    }
  }

  /**
   * 收集单天的收益数据
   */
  private async collectSingleDayRevenue(poolId: string, date: string) {
    // 检查是否已存在该日期的数据
    const existingData = await this.poolDailyRevenueRepository.findOne({
      where: {
        poolAddress: poolId,
        date
      },
    });

    if (existingData) {
      this.logger.log(`V4 池子 ${poolId} 在 ${date} 的数据已存在，跳过`);
      return existingData;
    }

    const pool = await this.poolV4Repository.findOne({
      where: { poolId },
    });

    if (!pool) {
      throw new Error(`V4 Pool ${poolId} not found`);
    }

    // 获取当日的区块范围
    const { startBlock, endBlock } = await this.getDayBlockRange(date, pool.chainId);

    // 收集该日的收益数据
    const revenueData = await this.calculateV4DailyRevenue(
      pool,
      startBlock,
      endBlock,
      date
    );

    // 保存数据
    const newRevenue = this.poolDailyRevenueRepository.create(revenueData);
    const saved = await this.poolDailyRevenueRepository.save(newRevenue);

    return saved;
  }

  /**
   * 计算 V4 池子指定时间段的收益数据
   */
  private async calculateV4DailyRevenue(
    pool: PoolV4,
    startBlock: number,
    endBlock: number,
    date: string
  ) {
    const config = this.getChainConfig(pool.chainId);
    const uniswapV4Utils = this.getUniswapV4Utils(pool.chainId);
    const stateViewContract = this.getStateViewContract(pool.chainId);
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

    // 获取区块信息
    const endBlockInfo = await provider.getBlock(endBlock);

    this.logger.log(`计算 V4 池子 ${pool.poolId} (Chain ${pool.chainId}) 在 ${date} 的收益数据 (区块 ${startBlock} - ${endBlock})`);

    // 🔥 修复1: 获取正确的价格信息
    let priceAtStart = "0";
    let priceAtEnd = "0";
    let currentTick = 0;

    try {
      // 获取结束时的价格信息
      const endSlot0 = await stateViewContract.getSlot0(pool.poolId);
      currentTick = parseInt(endSlot0.tick.toString());

      // 🔥 修复2: 正确创建 Token 实例
      const chainId = pool.chainId;

      const token0 = new Token(
        chainId,
        pool.token0Address === '0x0000000000000000000000000000000000000000'
          ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' // ETH -> WETH
          : pool.token0Address,
        pool.token0Decimals,
        pool.token0Symbol,
        pool.token0Symbol
      );

      const token1 = new Token(
        chainId,
        pool.token1Address === '0x0000000000000000000000000000000000000000'
          ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' // ETH -> WETH
          : pool.token1Address,
        pool.token1Decimals,
        pool.token1Symbol,
        pool.token1Symbol
      );

      const currentPrice = uniswapV4Utils.calculateTickPrice(currentTick, token0, token1);
      priceAtEnd = currentPrice.toString();

      // 暂时使用相同价格（避免历史查询复杂性）
      priceAtStart = priceAtEnd;

      this.logger.log(`V4 价格计算成功: tick=${currentTick}, price=${priceAtEnd}`);
    } catch (error) {
      this.logger.warn(`获取 V4 价格信息失败: ${error.message}`);
      priceAtStart = "1";
      priceAtEnd = "1";
    }

    // 计算价格变化百分比
    const priceChangePercent = priceAtStart !== "0" && priceAtEnd !== "0"
      ? ((parseFloat(priceAtEnd) - parseFloat(priceAtStart)) / parseFloat(priceAtStart) * 100).toFixed(4)
      : "0";

    // 🔥 混合方案: 使用 getFeeGrowthGlobals 计算精确手续费 + 事件计算交易量 - 传递工具类实例
    const revenueData = await this.calculateDailyRevenueHybrid(pool, startBlock, endBlock, date, uniswapV4Utils, stateViewContract);

    return {
      poolAddress: pool.poolId,
      date,
      blockNumber: endBlock.toString(),
      blockTimestamp: new Date(endBlockInfo.timestamp * 1000),
      ...revenueData,
      priceAtStart,
      priceAtEnd,
      priceChangePercent,
    };
  }

  /**
   * 🔥 修复：优先从 Swap 事件直接计算手续费（最可靠的方法）
   * StateView 的历史区块查询不可靠，改为从事件中直接计算
   */
  private async calculateDailyRevenueHybrid(
    pool: PoolV4,
    startBlock: number,
    endBlock: number,
    date: string,
    uniswapV4Utils: UniswapV4Utils,
    stateViewContract: ethers.Contract
  ) {
    try {
      // 🔥 步骤1: 优先从事件中计算手续费和交易量（最可靠的方法）
      this.logger.log(`🔍 从 Swap 事件中计算手续费和交易量...`);
      this.logger.log(`使用池子固定手续费: ${pool.feeTier} (费率: ${pool.feeTier / 10000}%)`);
      const eventData = await this.calculateRevenueFromEvents(
        pool.poolId,
        startBlock,
        endBlock,
        pool.chainId,
        pool.token0Decimals,
        pool.token1Decimals,
        pool.feeTier  // 🔥 传递池子的固定手续费
      );

      this.logger.log(`从事件计算得到:`);
      this.logger.log(`  手续费 Token0: ${eventData.feeRevenueToken0.toString()}`);
      this.logger.log(`  手续费 Token1: ${eventData.feeRevenueToken1.toString()}`);
      this.logger.log(`  交易量 Token0: ${eventData.volumeToken0.toString()}`);
      this.logger.log(`  交易量 Token1: ${eventData.volumeToken1.toString()}`);
      this.logger.log(`  事件数量: ${eventData.eventCount}`);

      // 🔥 步骤2: 尝试从 FeeGrowth 验证（可选，失败不影响）
      let verificationFeeToken0 = ethers.BigNumber.from(0);
      let verificationFeeToken1 = ethers.BigNumber.from(0);
      let averageLiquidity = ethers.BigNumber.from(0);

      try {
        this.logger.log(`🔍 尝试使用 FeeGrowth 验证数据（可选）...`);
        const [startFeeGrowth, endFeeGrowth] = await Promise.all([
          this.getFeeGrowthAtBlock(pool.poolId, startBlock, stateViewContract),
          this.getFeeGrowthAtBlock(pool.poolId, endBlock, stateViewContract)
        ]);

        if (startFeeGrowth.success && endFeeGrowth.success) {
          const feeGrowthDelta0 = ethers.BigNumber.from(endFeeGrowth.feeGrowthGlobal0X128)
            .sub(ethers.BigNumber.from(startFeeGrowth.feeGrowthGlobal0X128));
          const feeGrowthDelta1 = ethers.BigNumber.from(endFeeGrowth.feeGrowthGlobal1X128)
            .sub(ethers.BigNumber.from(startFeeGrowth.feeGrowthGlobal1X128));

          averageLiquidity = await this.calculateAverageLiquidity(pool.poolId, startBlock, endBlock, stateViewContract);
          const Q128 = ethers.BigNumber.from(2).pow(128);
          verificationFeeToken0 = feeGrowthDelta0.abs().mul(averageLiquidity).div(Q128);
          verificationFeeToken1 = feeGrowthDelta1.abs().mul(averageLiquidity).div(Q128);

          this.logger.log(`FeeGrowth 验证数据:`);
          this.logger.log(`  验证手续费 Token0: ${verificationFeeToken0.toString()}`);
          this.logger.log(`  验证手续费 Token1: ${verificationFeeToken1.toString()}`);
        } else {
          this.logger.warn(`⚠️  FeeGrowth 数据获取失败，跳过验证`);
        }
      } catch (error) {
        this.logger.warn(`⚠️  FeeGrowth 验证失败，继续使用事件数据: ${error.message}`);
      }

      // 🔥 步骤3: 获取当前流动性（用于显示）
      try {
        const currentLiquidity = await stateViewContract.getLiquidity(pool.poolId);
        averageLiquidity = currentLiquidity;
        this.logger.log(`当前流动性: ${averageLiquidity.toString()}`);
      } catch (error) {
        this.logger.warn(`获取流动性失败: ${error.message}`);
      }

      // 🔥 步骤4: 计算 USD 价值
      let currentTick = 0;
      try {
        const currentSlot0 = await stateViewContract.getSlot0(pool.poolId);
        currentTick = parseInt(currentSlot0.tick.toString());
      } catch (error) {
        this.logger.warn(`获取当前价格失败，使用默认值: ${error.message}`);
      }

      const feeRevenueUsd = await this.calculateUsdtValue(
        pool,
        eventData.feeRevenueToken0.toString(),
        eventData.feeRevenueToken1.toString(),
        currentTick
      );

      const volumeUsd = await this.calculateUsdtValue(
        pool,
        eventData.volumeToken0.toString(),
        eventData.volumeToken1.toString(),
        currentTick
      );

      // 🔥 步骤5: 验证数据合理性
      if (eventData.eventCount > 0) {
        this.logger.log(`✅ 检测到 ${eventData.eventCount} 笔交易`);

        if (verificationFeeToken0.gt(0) || verificationFeeToken1.gt(0)) {
          // 如果两种方法都有数据，进行对比
          const diff0 = eventData.feeRevenueToken0.sub(verificationFeeToken0).abs();
          const diff1 = eventData.feeRevenueToken1.sub(verificationFeeToken1).abs();

          if (diff0.gt(eventData.feeRevenueToken0.div(10)) || diff1.gt(eventData.feeRevenueToken1.div(10))) {
            this.logger.warn(`⚠️  事件计算和 FeeGrowth 验证差异较大，以事件数据为准`);
          } else {
            this.logger.log(`✅ 事件数据与 FeeGrowth 验证数据一致`);
          }
        }
      } else {
        this.logger.log(`ℹ️  该时间段内无交易活动`);
      }

      return {
        // 🎯 优先使用事件计算的精确手续费
        feeRevenueToken0: eventData.feeRevenueToken0.toString(),
        feeRevenueToken1: eventData.feeRevenueToken1.toString(),
        feeRevenueToken0Formatted: uniswapV4Utils.formatTokenAmount(eventData.feeRevenueToken0, pool.token0Decimals),
        feeRevenueToken1Formatted: uniswapV4Utils.formatTokenAmount(eventData.feeRevenueToken1, pool.token1Decimals),

        // 交易量信息
        volumeToken0: eventData.volumeToken0.toString(),
        volumeToken1: eventData.volumeToken1.toString(),
        volumeToken0Formatted: uniswapV4Utils.formatTokenAmount(eventData.volumeToken0, pool.token0Decimals),
        volumeToken1Formatted: uniswapV4Utils.formatTokenAmount(eventData.volumeToken1, pool.token1Decimals),

        // 流动性和USD价值
        liquidityChange: "0",
        totalLiquidity: averageLiquidity.toString(),
        feeRevenueUsd: feeRevenueUsd.toString(),
        volumeUsd: volumeUsd.toString(),
      };

    } catch (error) {
      this.logger.error(`混合方案计算失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🔥 新增: 获取指定区块的费用增长数据（用于验证，可能不支持历史查询）
   */
  private async getFeeGrowthAtBlock(poolId: string, blockNumber: number, stateViewContract: ethers.Contract) {
    try {
      const feeGrowth = await stateViewContract.getFeeGrowthGlobals(poolId, {
        blockTag: blockNumber
      });

      return {
        feeGrowthGlobal0X128: feeGrowth.feeGrowthGlobal0X128.toString(),
        feeGrowthGlobal1X128: feeGrowth.feeGrowthGlobal1X128.toString(),
        blockNumber,
        success: true
      };
    } catch (error) {
      // StateView 合约可能不支持历史区块查询
      this.logger.warn(`获取区块 ${blockNumber} 的费用增长数据失败: ${error.message}`);
      return {
        feeGrowthGlobal0X128: "0",
        feeGrowthGlobal1X128: "0",
        blockNumber,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 计算时间段内的平均流动性
   */
  private async calculateAverageLiquidity(
    poolId: string,
    startBlock: number,
    endBlock: number,
    stateViewContract: ethers.Contract
  ): Promise<ethers.BigNumber> {
    try {
      // 方法1: 简单取开始和结束的平均值
      const [startLiquidity, endLiquidity] = await Promise.all([
        stateViewContract.getLiquidity(poolId, { blockTag: startBlock }),
        stateViewContract.getLiquidity(poolId, { blockTag: endBlock })
      ]);

      const averageLiquidity = startLiquidity.add(endLiquidity).div(2);

      this.logger.log(`流动性数据:`);
      this.logger.log(`  开始: ${startLiquidity.toString()}`);
      this.logger.log(`  结束: ${endLiquidity.toString()}`);
      this.logger.log(`  平均: ${averageLiquidity.toString()}`);

      return averageLiquidity;

    } catch (error) {
      this.logger.warn(`获取平均流动性失败，使用结束时流动性: ${error.message}`);

      // 回退方案：使用结束时的流动性
      return await stateViewContract.getLiquidity(poolId, { blockTag: endBlock });
    }
  }

  /**
   * 🔥 修复：从 Swap 事件中直接计算手续费和交易量（V4 最可靠的方法）
   * 优先使用池子的固定 feeTier，如果事件中的 fee 不一致会记录警告
   */
  private async calculateRevenueFromEvents(
    poolId: string,
    startBlock: number,
    endBlock: number,
    chainId: number,
    token0Decimals: number,
    token1Decimals: number,
    poolFeeTier: number  // 🔥 池子的固定手续费
  ) {
    let feeRevenueToken0 = ethers.BigNumber.from(0);
    let feeRevenueToken1 = ethers.BigNumber.from(0);
    let volumeToken0 = ethers.BigNumber.from(0);
    let volumeToken1 = ethers.BigNumber.from(0);

    try {
      // 获取 Swap 事件
      const swapEvents = await this.getV4SwapEvents(poolId, startBlock, endBlock, chainId);
      this.logger.log(`找到 ${swapEvents.length} 个 Swap 事件用于计算`);

      const FEE_DENOMINATOR = 1000000; // V4 手续费分母

      // 🔥 优先使用池子的固定手续费
      const poolFeeBN = ethers.BigNumber.from(poolFeeTier);
      this.logger.log(`使用池子固定手续费: ${poolFeeTier} (费率: ${(poolFeeTier / 10000).toFixed(4)}%)`);

      for (const event of swapEvents) {
        const { amount0, amount1, fee, sender } = event.args;

        // 🔥 验证事件中的 fee 是否与池子一致
        let eventFeeBN: ethers.BigNumber;
        try {
          eventFeeBN = ethers.BigNumber.from(fee);

          // 如果事件中的 fee 与池子的 feeTier 不一致，记录警告（但使用池子的固定值）
          if (!eventFeeBN.eq(poolFeeBN)) {
            this.logger.warn(`⚠️  事件中的手续费 (${eventFeeBN.toString()}) 与池子固定手续费 (${poolFeeTier}) 不一致，使用池子固定值`);
          }
        } catch (error) {
          this.logger.warn(`事件中的 Fee 格式错误: ${fee}, 使用池子固定值 ${poolFeeTier}`);
        }

        // 🔥 使用池子的固定手续费进行计算（更可靠）
        const feeBN = poolFeeBN;

        // 🔥 V4 的 amount 是 int128，正确解析有符号数
        let signedAmount0: ethers.BigNumber;
        let signedAmount1: ethers.BigNumber;

        try {
          // int128 是有符号数，需要转换
          signedAmount0 = amount0.fromTwos ? amount0.fromTwos(128) : amount0;
          signedAmount1 = amount1.fromTwos ? amount1.fromTwos(128) : amount1;
        } catch (error) {
          // 如果 fromTwos 失败，直接使用原值
          signedAmount0 = amount0;
          signedAmount1 = amount1;
        }

        // 🔥 手续费计算：amount > 0 表示输入，从输入中扣除手续费
        // V4 的手续费公式：手续费 = 输入金额 * fee / 1000000
        if (signedAmount0.gt(0)) {
          // token0 是输入
          const inputAmount0 = signedAmount0;
          const fee0 = inputAmount0.mul(feeBN).div(FEE_DENOMINATOR);
          feeRevenueToken0 = feeRevenueToken0.add(fee0);
          volumeToken0 = volumeToken0.add(inputAmount0);
        } else if (signedAmount1.gt(0)) {
          // token1 是输入
          const inputAmount1 = signedAmount1;
          const fee1 = inputAmount1.mul(feeBN).div(FEE_DENOMINATOR);
          feeRevenueToken1 = feeRevenueToken1.add(fee1);
          volumeToken1 = volumeToken1.add(inputAmount1);
        }

        // 详细日志（只记录前几个）
        if (swapEvents.indexOf(event) < 3) {
          this.logger.log(`  事件 ${event.blockNumber}:`);
          this.logger.log(`    Amount0: ${signedAmount0.toString()}, Amount1: ${signedAmount1.toString()}`);

          // 🔥 修复：安全地获取 fee 的数值
          try {
            const feeValue = feeBN.toNumber();
            const feeRate = (feeValue / 10000).toFixed(4);
            this.logger.log(`    Fee: ${feeValue}, FeeRate: ${feeRate}%`);
          } catch (error) {
            this.logger.log(`    Fee: ${feeBN.toString()}`);
          }

          if (signedAmount0.gt(0)) {
            const calculatedFee = signedAmount0.mul(feeBN).div(FEE_DENOMINATOR);
            this.logger.log(`    手续费 Token0: ${calculatedFee.toString()}`);
          }
          if (signedAmount1.gt(0)) {
            const calculatedFee = signedAmount1.mul(feeBN).div(FEE_DENOMINATOR);
            this.logger.log(`    手续费 Token1: ${calculatedFee.toString()}`);
          }
        }
      }

      this.logger.log(`从事件计算完成:`);
      this.logger.log(`  手续费 Token0: ${feeRevenueToken0.toString()}`);
      this.logger.log(`  手续费 Token1: ${feeRevenueToken1.toString()}`);
      this.logger.log(`  交易量 Token0: ${volumeToken0.toString()}`);
      this.logger.log(`  交易量 Token1: ${volumeToken1.toString()}`);

      return {
        feeRevenueToken0,
        feeRevenueToken1,
        volumeToken0,
        volumeToken1,
        eventCount: swapEvents.length
      };

    } catch (error) {
      this.logger.error(`从事件计算手续费和交易量失败: ${error.message}`);
      return {
        feeRevenueToken0: ethers.BigNumber.from(0),
        feeRevenueToken1: ethers.BigNumber.from(0),
        volumeToken0: ethers.BigNumber.from(0),
        volumeToken1: ethers.BigNumber.from(0),
        eventCount: 0
      };
    }
  }

  /**
   * 🔥 增强：从事件中计算交易量（保留用于兼容性）
   */
  private async calculateVolumeFromEvents(
    poolId: string,
    startBlock: number,
    endBlock: number,
    chainId: number
  ) {
    let volumeToken0 = ethers.BigNumber.from(0);
    let volumeToken1 = ethers.BigNumber.from(0);

    try {
      // 获取 Swap 事件计算交易量
      const swapEvents = await this.getV4SwapEvents(poolId, startBlock, endBlock, chainId);
      this.logger.log(`找到 ${swapEvents.length} 个 Swap 事件用于交易量计算`);

      for (const event of swapEvents) {
        const { amount0, amount1, fee, sender } = event.args;

        // 🔥 V4 的 amount 是 int128，正确解析有符号数
        let signedAmount0: ethers.BigNumber;
        let signedAmount1: ethers.BigNumber;

        try {
          // 尝试使用 fromTwos 方法
          signedAmount0 = amount0.fromTwos ? amount0.fromTwos(128) : amount0;
          signedAmount1 = amount1.fromTwos ? amount1.fromTwos(128) : amount1;
        } catch (error) {
          // 如果 fromTwos 失败，直接使用原值
          signedAmount0 = amount0;
          signedAmount1 = amount1;
        }

        // 🔥 调试：记录每个事件的详情
        this.logger.log(`  事件 ${event.blockNumber}:`);
        this.logger.log(`    Sender: ${sender}`);
        this.logger.log(`    Amount0: ${signedAmount0.toString()} (原值: ${amount0.toString()})`);
        this.logger.log(`    Amount1: ${signedAmount1.toString()} (原值: ${amount1.toString()})`);
        this.logger.log(`    Fee: ${fee}`);

        // 累加绝对值作为交易量
        volumeToken0 = volumeToken0.add(signedAmount0.abs());
        volumeToken1 = volumeToken1.add(signedAmount1.abs());
      }

      this.logger.log(`交易量计算完成:`);
      this.logger.log(`  Token0: ${volumeToken0.toString()}`);
      this.logger.log(`  Token1: ${volumeToken1.toString()}`);

      return {
        volumeToken0,
        volumeToken1,
        eventCount: swapEvents.length
      };

    } catch (error) {
      this.logger.warn(`计算交易量失败: ${error.message}`);
      return {
        volumeToken0: ethers.BigNumber.from(0),
        volumeToken1: ethers.BigNumber.from(0),
        eventCount: 0
      };
    }
  }

  /**
   * 🔥 修复: 使用完整的 V4 Swap 事件结构
   */
  private async getV4SwapEvents(poolId: string, startBlock: number, endBlock: number, chainId: number) {
    try {
      const config = this.getChainConfig(chainId);
      const poolManager = new ethers.Contract(
        config.poolManagerAddress,
        [
          // 🔥 修复：添加缺失的 fee 字段
          "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
        ],
        new ethers.providers.JsonRpcProvider(config.rpcUrl)
      );

      const totalBlocks = endBlock - startBlock + 1;

      // 如果区块范围太大，分批查询
      if (totalBlocks > 5000) {
        this.logger.log(`区块范围较大 (${totalBlocks} 个区块)，使用批量查询`);
        return await this.querySwapEventsBatched(poolManager, poolId, startBlock, endBlock, 5000);
      }

      // 创建事件过滤器
      const filter = poolManager.filters.Swap(poolId);

      // 查询事件
      const events = await poolManager.queryFilter(filter, startBlock, endBlock);

      this.logger.log(`V4 Swap 事件查询成功: ${events.length} 个事件`);

      // 🔥 调试：打印前几个事件的详细信息
      if (events.length > 0) {
        for (const event of events.slice(0, 3)) {
          const { id, sender, amount0, amount1, sqrtPriceX96, liquidity, tick, fee } = event.args;
          this.logger.log(`  事件详情:`);
          this.logger.log(`    PoolId: ${id}`);
          this.logger.log(`    Sender: ${sender}`);
          this.logger.log(`    Amount0: ${amount0.toString()}`);
          this.logger.log(`    Amount1: ${amount1.toString()}`);
          this.logger.log(`    Tick: ${tick}`);
          this.logger.log(`    Fee: ${fee}`);
          this.logger.log(`    Block: ${event.blockNumber}`);
        }
      }

      return events;
    } catch (error) {
      this.logger.error(`V4 Swap 事件查询失败: ${error.message}`);

      // 如果单次查询失败，尝试分批查询
      this.logger.log(`尝试分批查询...`);
      try {
        const config = this.getChainConfig(chainId);
        const poolManager = new ethers.Contract(
          config.poolManagerAddress,
          [
            "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
          ],
          new ethers.providers.JsonRpcProvider(config.rpcUrl)
        );

        return await this.querySwapEventsBatched(poolManager, poolId, startBlock, endBlock, 1000);
      } catch (batchError) {
        this.logger.error(`分批查询也失败: ${batchError.message}`);
        return [];
      }
    }
  }

  /**
   * 🔄 分批查询 Swap 事件
   */
  private async querySwapEventsBatched(
    poolManager: ethers.Contract,
    poolId: string,
    startBlock: number,
    endBlock: number,
    batchSize: number
  ): Promise<ethers.Event[]> {

    const allEvents: ethers.Event[] = [];
    const totalBlocks = endBlock - startBlock + 1;
    const batches = Math.ceil(totalBlocks / batchSize);

    this.logger.log(`🔄 分 ${batches} 批查询事件，每批 ${batchSize} 个区块`);

    for (let i = 0; i < batches; i++) {
      const batchStartBlock = startBlock + (i * batchSize);
      const batchEndBlock = Math.min(batchStartBlock + batchSize - 1, endBlock);

      this.logger.log(`   批次 ${i + 1}/${batches}: 区块 ${batchStartBlock} - ${batchEndBlock}`);

      let attempt = 0;
      const maxRetries = 3;

      while (attempt < maxRetries) {
        try {
          const filter = poolManager.filters.Swap(poolId);
          const events = await poolManager.queryFilter(filter, batchStartBlock, batchEndBlock);

          allEvents.push(...events);
          this.logger.log(`     ✅ 找到 ${events.length} 个事件`);
          break;

        } catch (error) {
          attempt++;
          this.logger.warn(`     ❌ 批次 ${i + 1} 第 ${attempt} 次尝试失败: ${error.message}`);

          if (attempt >= maxRetries) {
            this.logger.error(`批次 ${i + 1} 查询失败，已重试 ${maxRetries} 次，跳过此批次`);
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      // 批次间延迟
      if (i < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    this.logger.log(`🎯 批量查询完成，总计找到 ${allEvents.length} 个 Swap 事件`);
    return allEvents;
  }

  /**
   * 获取指定区块的池子信息
   */
  private async getPoolInfoAtBlock(poolKey: any, blockNumber: number, chainId: number) {
    try {
      // 🔥 修复：使用 StateView 合约查询历史数据
      const uniswapV4Utils = this.getUniswapV4Utils(chainId);
      const stateViewContract = this.getStateViewContract(chainId);
      const poolId = uniswapV4Utils.calculatePoolId(poolKey);

      // 获取指定区块的池子状态
      const slot0 = await stateViewContract.getSlot0(poolId, { blockTag: blockNumber });

      return {
        currentTick: parseInt(slot0.tick),
        currentSqrtPriceX96: slot0.sqrtPriceX96.toString(),
        protocolFee: slot0.protocolFee,
        lpFee: slot0.lpFee,
      };
    } catch (error) {
      // 如果 V4 合约调用失败，返回默认值
      this.logger.warn(`V4 合约调用失败，使用默认值: ${error.message}`);
      return {
        currentTick: 0,
        sqrtPriceX96: "79228162514264337593543950336", // 默认价格 1:1
        protocolFee: 0,
        lpFee: poolKey.fee,
      };
    }
  }

  /**
   * 获取指定日期的区块范围（北京时间 UTC+8）
   */
  private async getDayBlockRange(date: string, chainId: number) {
    // 🔥 修复：使用北京时间（UTC+8）
    // 北京时间 00:00:00 对应 UTC 16:00:00 (前一天)
    // 北京时间 23:59:59 对应 UTC 15:59:59 (当天)
    const beijingStartOfDay = new Date(`${date}T00:00:00.000+08:00`);
    const beijingEndOfDay = new Date(`${date}T23:59:59.999+08:00`);

    // 转换为UTC时间
    const utcStartOfDay = new Date(beijingStartOfDay.getTime() - 8 * 60 * 60 * 1000);
    const utcEndOfDay = new Date(beijingEndOfDay.getTime() - 8 * 60 * 60 * 1000);

    this.logger.log(`🔥 北京时间范围: ${beijingStartOfDay.toISOString()} 到 ${beijingEndOfDay.toISOString()}`);
    this.logger.log(`🔥 UTC时间范围: ${utcStartOfDay.toISOString()} 到 ${utcEndOfDay.toISOString()}`);

    const startBlock = await this.getBlockByTimestamp(utcStartOfDay, chainId);
    const endBlock = await this.getBlockByTimestamp(utcEndOfDay, chainId);

    this.logger.log(`🔥 对应区块范围: ${startBlock} 到 ${endBlock} (共 ${endBlock - startBlock + 1} 个区块)`);

    return { startBlock, endBlock };
  }

  /**
   * 根据时间戳获取区块号（支持多链）
   */
  private async getBlockByTimestamp(timestamp: Date, chainId: number): Promise<number> {
    const config = this.getChainConfig(chainId);

    this.logger.log(`🔗 当前链: ${config.chainName}, 区块时间: ${config.blockTime}秒`);

    // 🔥 根据区块时间选择算法
    // 1-2秒的快速出块链（如 Unichain）：使用直接计算
    // 10秒以上的慢速出块链（如 Ethereum）：使用二分查找
    if (config.blockTime <= 2) {
      return await this.getFastBlockByTimestamp(timestamp, config.blockTime, chainId);
    } else {
      return await this.getSlowBlockByTimestamp(timestamp, chainId);
    }
  }

  /**
   * 🔥 快速出块链（1-2秒）：直接计算
   */
  private async getFastBlockByTimestamp(timestamp: Date, blockTime: number, chainId: number): Promise<number> {
    const config = this.getChainConfig(chainId);
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

    const targetTimestamp = Math.floor(timestamp.getTime() / 1000);

    // 获取最新区块作为参考点
    const latestBlock = await provider.getBlock("latest");
    const latestTimestamp = latestBlock.timestamp;
    const latestNumber = latestBlock.number;

    // 🔥 快速出块链：直接计算区块高度
    // 区块高度 = 最新区块高度 - ((最新时间戳 - 目标时间戳) / 区块时间)
    const timeDiff = latestTimestamp - targetTimestamp;
    const blockDiff = Math.floor(timeDiff / blockTime);
    const estimatedBlock = latestNumber - blockDiff;

    this.logger.log(`🔥 快速链区块计算 (${blockTime}秒/块):`);
    this.logger.log(`  目标时间戳: ${targetTimestamp} (${new Date(targetTimestamp * 1000).toISOString()})`);
    this.logger.log(`  最新区块: ${latestNumber}, 时间戳: ${latestTimestamp} (${new Date(latestTimestamp * 1000).toISOString()})`);
    this.logger.log(`  时间差: ${timeDiff} 秒`);
    this.logger.log(`  区块差: ${blockDiff} 个区块`);
    this.logger.log(`  估算区块: ${estimatedBlock}`);

    // 验证估算的区块是否合理
    try {
      const estimatedBlockInfo = await provider.getBlock(estimatedBlock);
      const timeDiffCheck = Math.abs(estimatedBlockInfo.timestamp - targetTimestamp);

      if (timeDiffCheck <= blockTime * 2) { // 允许2个区块的误差
        this.logger.log(`✅ 区块验证成功: ${estimatedBlock}, 时间差: ${timeDiffCheck}秒`);
        return estimatedBlock;
      } else {
        this.logger.log(`⚠️ 区块验证失败，时间差: ${timeDiffCheck}秒，使用估算值`);
        return estimatedBlock;
      }
    } catch (error) {
      this.logger.warn(`区块验证失败: ${error.message}，使用估算值`);
      return Math.max(0, estimatedBlock); // 确保不会返回负数
    }
  }

  /**
   * 🔥 慢速出块链（10秒以上）：使用二分查找
   */
  private async getSlowBlockByTimestamp(timestamp: Date, chainId: number): Promise<number> {
    const config = this.getChainConfig(chainId);
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

    const targetTimestamp = Math.floor(timestamp.getTime() / 1000);
    const latestBlock = await provider.getBlock("latest");

    this.logger.log(`🔍 慢速链区块查找（二分查找）:`);
    this.logger.log(`  目标时间戳: ${targetTimestamp} (${new Date(targetTimestamp * 1000).toISOString()})`);
    this.logger.log(`  最新区块: ${latestBlock.number}, 时间戳: ${latestBlock.timestamp}`);

    // 二分查找最接近的区块
    let low = 0;
    let high = latestBlock.number;
    let iterations = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const block = await provider.getBlock(mid);
      iterations++;

      if (block.timestamp === targetTimestamp) {
        this.logger.log(`✅ 精确匹配区块: ${mid}, 迭代次数: ${iterations}`);
        return mid;
      } else if (block.timestamp < targetTimestamp) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    this.logger.log(`✅ 二分查找完成: ${high}, 迭代次数: ${iterations}`);
    return high; // 返回最接近但不超过目标时间戳的区块
  }

  /**
   * 🔥 修复: 优化 USDT 价值计算
   */
  private async calculateUsdtValue(
    pool: PoolV4,
    token0Amount: string,
    token1Amount: string,
    currentTick: number
  ): Promise<number> {
    try {
      const uniswapV4Utils = this.getUniswapV4Utils(pool.chainId);

      const amount0 = parseFloat(uniswapV4Utils.formatTokenAmount(
        ethers.BigNumber.from(token0Amount),
        pool.token0Decimals
      ));
      const amount1 = parseFloat(uniswapV4Utils.formatTokenAmount(
        ethers.BigNumber.from(token1Amount),
        pool.token1Decimals
      ));

      this.logger.log(`计算 USD 价值: amount0=${amount0}, amount1=${amount1}, tick=${currentTick}`);

      // 如果金额为0，直接返回0
      if (amount0 === 0 && amount1 === 0) {
        return 0;
      }

      let usdtValue = 0;

      // 创建 Token 实例进行价格计算
      const chainId = pool.chainId;

      const token0 = new Token(
        chainId,
        pool.token0Address === '0x0000000000000000000000000000000000000000'
          ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
          : pool.token0Address,
        pool.token0Decimals,
        pool.token0Symbol,
        pool.token0Symbol
      );

      const token1 = new Token(
        chainId,
        pool.token1Address === '0x0000000000000000000000000000000000000000'
          ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
          : pool.token1Address,
        pool.token1Decimals,
        pool.token1Symbol,
        pool.token1Symbol
      );

      // 安全的价格计算
      let price = 1;
      try {
        if (currentTick !== 0) {
          const priceResult = uniswapV4Utils.calculateTickPrice(currentTick, token0, token1);
          price = parseFloat(priceResult.toString()) || 1;
        }
      } catch (priceError) {
        this.logger.warn(`价格计算失败，使用默认价格 1: ${priceError.message}`);
        price = 1;
      }

      // 判断哪个是稳定币并计算 USD 价值
      const token0Symbol = (pool.token0Symbol || '').toUpperCase();
      const token1Symbol = (pool.token1Symbol || '').toUpperCase();

      if (token0Symbol === 'USDT' || token0Symbol === 'USDC') {
        // token0 是稳定币
        usdtValue = amount0 + (amount1 / price);
      } else if (token1Symbol === 'USDT' || token1Symbol === 'USDC') {
        // token1 是稳定币
        usdtValue = (amount0 * price) + amount1;
      } else {
        // 都不是稳定币，使用固定价格映射
        const priceMap: { [key: string]: number } = {
          'ETH': 3500,
          'WETH': 3500,
          'BTC': 65000,
          'WBTC': 65000,
          'DAI': 1,
        };

        const token0Price = priceMap[token0Symbol] || 0;
        const token1Price = priceMap[token1Symbol] || 0;

        usdtValue = (amount0 * token0Price) + (amount1 * token1Price);
      }

      this.logger.log(`USD 价值计算结果: ${usdtValue.toFixed(4)}`);
      return Math.max(0, usdtValue); // 确保非负

    } catch (error) {
      this.logger.error(`USDT 价值计算失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 获取 V4 池子的收益历史数据
   */
  async getPoolV4RevenueHistory(
    poolId: string,
    startDate?: string,
    endDate?: string,
    limit: number = 100
  ) {
    const query = this.poolDailyRevenueRepository
      .createQueryBuilder('revenue')
      .where('revenue.poolAddress = :poolId', { poolId }); // poolAddress 字段存储 poolId

    if (startDate) {
      query.andWhere('revenue.date >= :startDate', { startDate });
    }

    if (endDate) {
      query.andWhere('revenue.date <= :endDate', { endDate });
    }

    const [data, total] = await query
      .orderBy('revenue.date', 'DESC')
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      limit,
    };
  }

  /**
   * 🧪 测试方法：验证 V4 事件查询
   */
  async testV4EventQuery(poolId: string, chainId: number = 130) {
    this.logger.log(`\n🧪 测试 V4 事件查询:`);
    this.logger.log(`目标池子: ${poolId}, Chain ID: ${chainId}`);

    try {
      const config = this.getChainConfig(chainId);
      const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

      const latestBlock = await provider.getBlockNumber();
      const startBlock = latestBlock - 2000; // 最近2000个区块

      this.logger.log(`测试区块范围: ${startBlock} - ${latestBlock}`);

      // 测试事件查询
      const events = await this.getV4SwapEvents(poolId, startBlock, latestBlock, chainId);

      if (events.length > 0) {
        this.logger.log(`✅ 成功找到 ${events.length} 个事件`);

        // 分析事件数据
        const totalVolume0 = events.reduce((sum, event) => {
          const amount0 = event.args.amount0;
          const signedAmount0 = amount0.fromTwos ? amount0.fromTwos(128) : amount0;
          return sum.add(signedAmount0.abs());
        }, ethers.BigNumber.from(0));

        const totalVolume1 = events.reduce((sum, event) => {
          const amount1 = event.args.amount1;
          const signedAmount1 = amount1.fromTwos ? amount1.fromTwos(128) : amount1;
          return sum.add(signedAmount1.abs());
        }, ethers.BigNumber.from(0));

        this.logger.log(`总交易量:`);
        this.logger.log(`  Token0: ${totalVolume0.toString()}`);
        this.logger.log(`  Token1: ${totalVolume1.toString()}`);

        // 显示手续费信息
        const fees = events.map(e => e.args.fee);
        const uniqueFees = [...new Set(fees.map(f => f.toString()))];
        this.logger.log(`手续费类型: ${uniqueFees.join(', ')}`);

      } else {
        this.logger.warn(`❌ 未找到任何事件`);

        // 尝试查询所有池子的事件
        this.logger.log(`尝试查询所有池子的事件...`);

        const config = this.getChainConfig(chainId);
        const poolManager = new ethers.Contract(
          config.poolManagerAddress,
          [
            "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
          ],
          new ethers.providers.JsonRpcProvider(config.rpcUrl)
        );

        const allFilter = poolManager.filters.Swap();
        const allEvents = await poolManager.queryFilter(allFilter, startBlock, latestBlock);

        this.logger.log(`所有池子的事件数量: ${allEvents.length}`);

        if (allEvents.length > 0) {
          const poolIds = [...new Set(allEvents.map(e => e.args.id))];
          this.logger.log(`活跃的池子数量: ${poolIds.length}`);
          this.logger.log(`前5个池子ID:`);

          for (const pid of poolIds.slice(0, 5)) {
            const count = allEvents.filter(e => e.args.id === pid).length;
            this.logger.log(`  ${pid}: ${count} 笔交易`);

            if (pid.toLowerCase() === poolId.toLowerCase()) {
              this.logger.log(`  🎯 目标池子有匹配！`);
            }
          }
        }
      }

    } catch (error) {
      this.logger.error(`测试失败: ${error.message}`);
    }
  }

  /**
   * 🧪 测试完整的收益计算流程
   */
  async testV4RevenueCalculation(poolId: string, date?: string) {
    this.logger.log(`\n🧪 测试 V4 收益计算流程:`);

    const testDate = date || new Date().toISOString().split('T')[0];

    try {
      const result = await this.collectSingleDayRevenue(poolId, testDate);

      this.logger.log(`✅ 收益计算测试完成:`);
      this.logger.log(`  日期: ${testDate}`);
      this.logger.log(`  手续费 Token0: ${result.feeRevenueToken0Formatted}`);
      this.logger.log(`  手续费 Token1: ${result.feeRevenueToken1Formatted}`);
      this.logger.log(`  交易量 Token0: ${result.volumeToken0Formatted}`);
      this.logger.log(`  交易量 Token1: ${result.volumeToken1Formatted}`);
      this.logger.log(`  手续费 USD: ${result.feeRevenueUsd}`);
      this.logger.log(`  交易量 USD: ${result.volumeUsd}`);

      return result;

    } catch (error) {
      this.logger.error(`收益计算测试失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取所有 V4 池子的最新收益数据
   */
  async getAllV4PoolsLatestRevenue() {
    // 获取所有 V4 池子的 poolId
    const v4Pools = await this.poolV4Repository.find({
      where: { isActive: true },
      select: ['poolId']
    });

    const poolIds = v4Pools.map(pool => pool.poolId);

    if (poolIds.length === 0) {
      return [];
    }

    const query = this.poolDailyRevenueRepository
      .createQueryBuilder('revenue')
      .distinctOn(['revenue.poolAddress'])
      .where('revenue.poolAddress IN (:...poolIds)', { poolIds })
      .orderBy('revenue.poolAddress')
      .addOrderBy('revenue.date', 'DESC');

    return await query.getMany();
  }
}
