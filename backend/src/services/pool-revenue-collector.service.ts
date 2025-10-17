import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ethers } from "ethers";
import { Token } from "@uniswap/sdk-core";
import { Pool } from "../entities/pool.entity";
import { PoolDailyRevenue } from "../entities/pool-daily-revenue.entity";
import { UniswapV3Utils } from "../utils/uniswap-v3.utils";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PoolRevenueCollectorService {
  private readonly logger = new Logger(PoolRevenueCollectorService.name);

  constructor(
    @InjectRepository(Pool)
    private poolRepository: Repository<Pool>,
    @InjectRepository(PoolDailyRevenue)
    private poolDailyRevenueRepository: Repository<PoolDailyRevenue>,
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
   * 根据 chainId 获取配置
   */
  private getChainConfig(chainId: number) {
    const getConfig = this.configService.get<Function>("ethereum.getConfig");
    return getConfig(chainId);
  }

  /**
   * 定时收集每日收益数据
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async collectDailyRevenue() {
    this.logger.log("开始收集每日收益数据...");

    try {
      const pools = await this.poolRepository.find({
        where: { isActive: true },
      });

      for (const pool of pools) {
        await this.collectPoolDailyRevenue(pool.address);
      }

      this.logger.log("每日收益数据收集完成");
    } catch (error) {
      this.logger.error("收集每日收益数据失败:", error);
    }
  }

  /**
   * 收集指定池子的每日收益数据
   */
  async collectPoolDailyRevenue(poolAddress: string, targetDate?: string) {
    try {
      const pool = await this.poolRepository.findOne({
        where: { address: poolAddress },
      });

      if (!pool) {
        throw new Error(`Pool ${poolAddress} not found`);
      }

      const date = targetDate || new Date().toISOString().split('T')[0];

      this.logger.log(`开始收集池子 ${poolAddress} 在 ${date} 的收益数据`);

      // 检查是否已存在该日期的数据
      const existingData = await this.poolDailyRevenueRepository.findOne({
        where: { poolAddress, date },
      });

      if (existingData) {
        this.logger.log(`池子 ${poolAddress} 在 ${date} 的数据已存在，跳过`);
        return existingData;
      }

      // 获取当日的区块范围
      const { startBlock, endBlock } = await this.getDayBlockRange(date, pool.chainId);

      // 收集该日的收益数据
      const revenueData = await this.calculateDailyRevenue(
        pool,
        startBlock,
        endBlock,
        date
      );

      // 保存数据
      const newRevenue = this.poolDailyRevenueRepository.create(revenueData);
      const saved = await this.poolDailyRevenueRepository.save(newRevenue);

      this.logger.log(`已收集池子 ${poolAddress} 在 ${date} 的收益数据`);
      return saved;
    } catch (error) {
      this.logger.error(`收集池子 ${poolAddress} 收益数据失败:`, error);
      throw error;
    }
  }

  /**
   * 收集最新一个月的收益数据
   */
  async collectLatestRevenueData() {
    this.logger.log("开始收集最新一个月收益数据...");

    try {
      const pools = await this.poolRepository.find({
        where: { isActive: true },
      });

      const currentDate = new Date();
      const oneMonthAgo = new Date(currentDate);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      this.logger.log(`收集时间范围: ${oneMonthAgo.toISOString().split('T')[0]} 到 ${currentDate.toISOString().split('T')[0]}`);

      for (const pool of pools) {
        try {
          await this.collectPoolMonthlyData(pool.address, oneMonthAgo, currentDate);
        } catch (error) {
          this.logger.error(`处理池子 ${pool.address} 失败:`, error);
          continue;
        }
      }

      this.logger.log("最新一个月收益数据收集完成");
    } catch (error) {
      this.logger.error("收集最新收益数据失败:", error);
      throw error;
    }
  }

  /**
   * 收集指定池子在指定时间范围内的数据
   */
  private async collectPoolMonthlyData(poolAddress: string, startDate: Date, endDate: Date) {
    this.logger.log(`开始收集池子 ${poolAddress} 从 ${startDate.toISOString().split('T')[0]} 到 ${endDate.toISOString().split('T')[0]} 的数据`);

    // 检查是否已有该池子的最新数据记录

    const existingRecords = await this.poolDailyRevenueRepository.find({
      where: {
        poolAddress
      },
      order: { date: 'DESC' },
      take: 1
    });

    let actualStartDate = startDate;

    if (existingRecords.length > 0) {
      // 如果有现有数据，从最新记录的下一天开始
      const latestDate = new Date(existingRecords[0].date);
      latestDate.setDate(latestDate.getDate() + 1);

      if (latestDate > endDate) {
        this.logger.log(`池子 ${poolAddress} 数据已是最新，跳过`);
        return;
      }

      actualStartDate = latestDate;
      this.logger.log(`池子 ${poolAddress} 从最新记录后继续: ${actualStartDate.toISOString().split('T')[0]}`);
    }

    // 按天收集数据
    const currentDateObj = new Date(actualStartDate);
    const targetEndDate = endDate.toISOString().split('T')[0];

    while (currentDateObj.toISOString().split('T')[0] <= targetEndDate) {
      const dateStr = currentDateObj.toISOString().split('T')[0];

      try {
        await this.collectPoolDailyRevenue(poolAddress, dateStr);
        this.logger.log(`完成收集 ${poolAddress} 在 ${dateStr} 的数据`);

        // 添加延迟避免RPC请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        this.logger.error(`收集 ${poolAddress} 在 ${dateStr} 数据失败:`, error);
      }

      // 移到下一天
      currentDateObj.setDate(currentDateObj.getDate() + 1);
    }
  }

  /**
   * 批量同步历史收益数据 - 按月收集
   */
  async syncHistoricalRevenue(
    poolAddress: string,
    startBlockNumber?: number,
    endBlockNumber?: number,
    blockInterval: number = 7200 // 保留参数兼容性，但改为按日期收集
  ) {
    try {
      const pool = await this.poolRepository.findOne({
        where: { address: poolAddress },
      });

      if (!pool) {
        throw new Error(`Pool ${poolAddress} not found`);
      }

      const provider = new ethers.providers.JsonRpcProvider(
        this.configService.get<string>("ethereum.rpcUrl")
      );

      let startDate: Date;
      let endDate: Date;

      if (startBlockNumber) {
        // 如果指定了起始区块，转换为日期
        const startBlock = await provider.getBlock(startBlockNumber);
        startDate = new Date(startBlock.timestamp * 1000);
      } else {
        // 检查是否已有历史数据
        const latestRevenue = await this.poolDailyRevenueRepository.findOne({
          where: { poolAddress },
          order: { date: 'DESC' }
        });

        if (latestRevenue) {
          // 从最新记录的下一天开始
          startDate = new Date(latestRevenue.date);
          startDate.setDate(startDate.getDate() + 1);
        } else {
          // 如果没有历史记录，从合理的历史起点开始
          startDate = new Date('2023-01-01T00:00:00.000Z');
        }
      }

      if (endBlockNumber) {
        const endBlock = await provider.getBlock(endBlockNumber);
        endDate = new Date(endBlock.timestamp * 1000);
      } else {
        endDate = new Date(); // 到当前时间
      }

      this.logger.log(
        `开始同步池子 ${poolAddress} 从 ${startDate.toISOString().split('T')[0]} 到 ${endDate.toISOString().split('T')[0]} 的历史收益数据`
      );

      const syncResults = [];

      // 按月收集数据，避免一次性处理太多数据
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const monthEnd = new Date(currentDate);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        monthEnd.setDate(0); // 设置为上个月的最后一天

        const actualEndDate = monthEnd > endDate ? endDate : monthEnd;

        this.logger.log(`处理月份数据: ${currentDate.toISOString().split('T')[0]} 到 ${actualEndDate.toISOString().split('T')[0]}`);

        try {
          await this.collectPoolMonthlyData(poolAddress, new Date(currentDate), actualEndDate);

          // 统计这个月收集的数据
          const monthlyCount = await this.poolDailyRevenueRepository.count({
            where: {
              poolAddress
            }
          });

          syncResults.push({ month: currentDate.toISOString().split('T')[0], count: monthlyCount });

        } catch (error) {
          this.logger.error(`同步 ${currentDate.toISOString().split('T')[0]} 月份数据失败:`, error);
        }

        // 移到下一个月
        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(1); // 设置为月初

        // 避免请求过于频繁
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.logger.log(`历史收益数据同步完成，处理了 ${syncResults.length} 个月的数据`);
      return { success: true, syncedMonths: syncResults.length, details: syncResults };

    } catch (error) {
      this.logger.error(`同步历史收益数据失败:`, error);
      throw error;
    }
  }

  /**
   * 计算指定时间段的收益数据
   */
  private async calculateDailyRevenue(
    pool: Pool,
    startBlock: number,
    endBlock: number,
    date: string
  ) {
    const config = this.getChainConfig(pool.chainId);
    const uniswapUtils = this.getUniswapUtils(pool.chainId);
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

    // 获取区块信息
    const endBlockInfo = await provider.getBlock(endBlock);

    // 获取池子合约实例
    const poolContract = new ethers.Contract(
      pool.address,
      [
        "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
        "function liquidity() external view returns (uint128)",
        "function feeGrowthGlobal0X128() external view returns (uint256)",
        "function feeGrowthGlobal1X128() external view returns (uint256)",
        "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
        "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
        "event Burn(address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)"
      ],
      provider
    );

    // 获取开始和结束时的价格信息
    let priceAtStart = "0";
    let priceAtEnd = "0";

    try {
      const [startSlot0, endSlot0] = await Promise.all([
        poolContract.slot0({ blockTag: startBlock }),
        poolContract.slot0({ blockTag: endBlock })
      ]);

      const token0 = new Token(
        pool.chainId,
        pool.token0Address,
        pool.token0Decimals,
        pool.token0Symbol,
        pool.token0Symbol
      );
      const token1 = new Token(
        pool.chainId,
        pool.token1Address,
        pool.token1Decimals,
        pool.token1Symbol,
        pool.token1Symbol
      );

      priceAtStart = uniswapUtils.calculateTickPrice(startSlot0.tick, token0, token1).toString();
      priceAtEnd = uniswapUtils.calculateTickPrice(endSlot0.tick, token0, token1).toString();
    } catch (error) {
      this.logger.warn(`获取价格信息失败: ${error.message}`);
    }

    // 计算价格变化百分比
    const priceChangePercent = priceAtStart !== "0" && priceAtEnd !== "0"
      ? ((parseFloat(priceAtEnd) - parseFloat(priceAtStart)) / parseFloat(priceAtStart) * 100).toFixed(4)
      : "0";

    // 获取交易事件来计算手续费收入和交易量
    let feeRevenueToken0 = ethers.BigNumber.from(0);
    let feeRevenueToken1 = ethers.BigNumber.from(0);
    let volumeToken0 = ethers.BigNumber.from(0);
    let volumeToken1 = ethers.BigNumber.from(0);

    try {
      // 获取Swap事件
      const swapFilter = poolContract.filters.Swap();
      const swapEvents = await poolContract.queryFilter(swapFilter, startBlock, endBlock);

      // 手续费计算常量
      const FEE_DENOMINATOR = 1000000;
      const feeTierBI = ethers.BigNumber.from(pool.feeTier);

      for (const event of swapEvents) {
        const { amount0, amount1 } = event.args;

        // 解析为有符号值（池子视角）
        const signedAmount0 = amount0.fromTwos(256);
        const signedAmount1 = amount1.fromTwos(256);

        // 仅对输入侧计提手续费和统计交易量（amount > 0 表示池子收到 = 输入）
        if (signedAmount0.gt(0)) {
          // token0为输入
          volumeToken0 = volumeToken0.add(signedAmount0);
          const fee0 = signedAmount0.mul(feeTierBI).div(FEE_DENOMINATOR);
          feeRevenueToken0 = feeRevenueToken0.add(fee0);
        } else if (signedAmount1.gt(0)) {
          // token1为输入
          volumeToken1 = volumeToken1.add(signedAmount1);
          const fee1 = signedAmount1.mul(feeTierBI).div(FEE_DENOMINATOR);
          feeRevenueToken1 = feeRevenueToken1.add(fee1);
        }
      }
    } catch (error) {
      this.logger.warn(`获取交易事件失败: ${error.message}`);
    }

    // 获取流动性信息
    let totalLiquidity = "0";
    try {
      const liquidity = await poolContract.liquidity({ blockTag: endBlock });
      totalLiquidity = liquidity.toString();
    } catch (error) {
      this.logger.warn(`获取流动性信息失败: ${error.message}`);
    }

    // 获取结束时的tick信息用于价格计算
    let endTick = 0; // 默认值
    try {
      const endSlot0 = await poolContract.slot0({ blockTag: endBlock });
      endTick = endSlot0.tick;
    } catch (error) {
      this.logger.warn(`获取结束时tick信息失败，使用默认值0: ${error.message}`);
    }

    // 计算USDT价值（基于当前tick价格）
    const feeRevenueUsd = await this.calculateUsdtValue(
      pool,
      feeRevenueToken0.toString(),
      feeRevenueToken1.toString(),
      endTick
    );

    const volumeUsd = await this.calculateUsdtValue(
      pool,
      volumeToken0.toString(),
      volumeToken1.toString(),
      endTick
    );

    return {
      poolAddress: pool.address,
      date,
      blockNumber: endBlock.toString(),
      blockTimestamp: new Date(endBlockInfo.timestamp * 1000),
      feeRevenueToken0: feeRevenueToken0.toString(),
      feeRevenueToken1: feeRevenueToken1.toString(),
      feeRevenueToken0Formatted: uniswapUtils.formatTokenAmount(feeRevenueToken0, pool.token0Decimals),
      feeRevenueToken1Formatted: uniswapUtils.formatTokenAmount(feeRevenueToken1, pool.token1Decimals),
      liquidityChange: "0", // 暂时设为0，后续可以计算
      totalLiquidity,
      priceAtStart,
      priceAtEnd,
      priceChangePercent,
      volumeToken0: volumeToken0.toString(),
      volumeToken1: volumeToken1.toString(),
      volumeToken0Formatted: uniswapUtils.formatTokenAmount(volumeToken0, pool.token0Decimals),
      volumeToken1Formatted: uniswapUtils.formatTokenAmount(volumeToken1, pool.token1Decimals),
      feeRevenueUsd: feeRevenueUsd.toString(),
      volumeUsd: volumeUsd.toString(),
    };
  }

  /**
   * 获取指定日期的区块范围（需要池子的 chainId）
   */
  private async getDayBlockRange(date: string, chainId: number) {
    const config = this.getChainConfig(chainId);
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const startBlock = await this.getBlockByTimestamp(startOfDay, chainId);
    const endBlock = await this.getBlockByTimestamp(endOfDay, chainId);

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
   * 计算USDT价值（基于池子当前tick价格）
   */
  private async calculateUsdtValue(
    pool: Pool,
    token0Amount: string,
    token1Amount: string,
    currentTick: number
  ): Promise<number> {
    const uniswapUtils = this.getUniswapUtils(pool.chainId);

    const amount0 = parseFloat(uniswapUtils.formatTokenAmount(
      ethers.BigNumber.from(token0Amount),
      pool.token0Decimals
    ));
    const amount1 = parseFloat(uniswapUtils.formatTokenAmount(
      ethers.BigNumber.from(token1Amount),
      pool.token1Decimals
    ));

    let usdtValue = 0;

    // 创建Token实例
    const token0 = new Token(
      pool.chainId,
      pool.token0Address,
      pool.token0Decimals,
      pool.token0Symbol,
      pool.token0Symbol
    );
    const token1 = new Token(
      pool.chainId,
      pool.token1Address,
      pool.token1Decimals,
      pool.token1Symbol,
      pool.token1Symbol
    );

    // 获取当前tick对应的价格
    const price = uniswapUtils.calculateTickPrice(currentTick, token0, token1);

    // 判断哪个是USDT，然后计算价值
    if (pool.token0Symbol.toUpperCase() === 'USDT') {
      // token0是USDT，token1对USDT的价格是 1/price
      usdtValue = amount0 + (amount1 / parseFloat(price.toString()));
    } else if (pool.token1Symbol.toUpperCase() === 'USDT') {
      // token1是USDT，token0对USDT的价格是 price
      usdtValue = (amount0 * parseFloat(price.toString())) + amount1;
    } else if (pool.token0Symbol.toUpperCase() === 'USDC' || pool.token1Symbol.toUpperCase() === 'USDC') {
      // 如果是USDC池子，按1:1计算（USDC≈USDT）
      if (pool.token0Symbol.toUpperCase() === 'USDC') {
        usdtValue = amount0 + (amount1 / parseFloat(price.toString()));
      } else {
        usdtValue = (amount0 * parseFloat(price.toString())) + amount1;
      }
    } else {
      // 其他情况使用固定价格映射（兜底方案）
      const priceMap: { [key: string]: number } = {
        'ETH': 2000,
        'WETH': 2000,
        'BTC': 40000,
        'WBTC': 40000,
        'USDC': 1,
        'USDT': 1,
        'DAI': 1,
      };

      const token0Price = priceMap[pool.token0Symbol.toUpperCase()] || 0;
      const token1Price = priceMap[pool.token1Symbol.toUpperCase()] || 0;

      usdtValue = (amount0 * token0Price) + (amount1 * token1Price);
    }

    return usdtValue;
  }

  /**
   * 获取池子的收益历史数据
   */
  async getPoolRevenueHistory(
    poolAddress: string,
    startDate?: string,
    endDate?: string,
    limit: number = 100
  ) {
    const query = this.poolDailyRevenueRepository
      .createQueryBuilder('revenue')
      .leftJoinAndSelect('revenue.pool', 'pool')
      .where('revenue.poolAddress = :poolAddress', { poolAddress });

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
   * 获取所有池子的最新收益数据
   */
  async getAllPoolsLatestRevenue() {
    const query = this.poolDailyRevenueRepository
      .createQueryBuilder('revenue')
      .distinctOn(['revenue.poolAddress'])
      .leftJoinAndSelect('revenue.pool', 'pool')
      .orderBy('revenue.poolAddress')
      .addOrderBy('revenue.date', 'DESC');

    return await query.getMany();
  }
}
