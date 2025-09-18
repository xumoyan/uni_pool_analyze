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
  private uniswapV4Utils: UniswapV4Utils;

  constructor(
    @InjectRepository(PoolV4)
    private poolV4Repository: Repository<PoolV4>,
    @InjectRepository(PoolDailyRevenue)
    private poolDailyRevenueRepository: Repository<PoolDailyRevenue>,
    private configService: ConfigService,
  ) {
    const rpcUrl = this.configService.get<string>("ethereum.rpcUrl");
    const poolManagerAddress = this.configService.get<string>("ethereum.poolManagerAddress");
    this.uniswapV4Utils = new UniswapV4Utils(rpcUrl, poolManagerAddress);
  }

  /**
   * 定时收集 V4 每日收益数据
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM) // 避免与V3收集时间冲突
  async collectV4DailyRevenue() {
    this.logger.log("开始收集 V4 每日收益数据...");

    try {
      const pools = await this.poolV4Repository.find({
        where: { isActive: true },
      });

      for (const pool of pools) {
        await this.collectPoolDailyRevenue(pool.poolId);
      }

      this.logger.log("V4 每日收益数据收集完成");
    } catch (error) {
      this.logger.error("收集 V4 每日收益数据失败:", error);
    }
  }

  /**
   * 收集指定 V4 池子的每日收益数据
   */
  async collectPoolDailyRevenue(poolId: string, targetDate?: string) {
    try {
      const pool = await this.poolV4Repository.findOne({
        where: { poolId },
      });

      if (!pool) {
        throw new Error(`V4 Pool ${poolId} not found`);
      }

      const date = targetDate || new Date().toISOString().split('T')[0];

      this.logger.log(`开始收集 V4 池子 ${poolId} 在 ${date} 的收益数据`);

      // 检查是否已存在该日期的数据
      // 注意：V4 池子使用 poolId 而不是 poolAddress
      const existingData = await this.poolDailyRevenueRepository.findOne({
        where: {
          poolAddress: poolId, // 复用 poolAddress 字段存储 poolId
          date
        },
      });

      if (existingData) {
        this.logger.log(`V4 池子 ${poolId} 在 ${date} 的数据已存在，跳过`);
        return existingData;
      }

      // 获取当日的区块范围
      const { startBlock, endBlock } = await this.getDayBlockRange(date);

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

      this.logger.log(`已收集 V4 池子 ${poolId} 在 ${date} 的收益数据`);
      return saved;
    } catch (error) {
      this.logger.error(`收集 V4 池子 ${poolId} 收益数据失败:`, error);
      throw error;
    }
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
    const provider = new ethers.providers.JsonRpcProvider(
      this.configService.get<string>("ethereum.rpcUrl")
    );

    // 获取区块信息
    const endBlockInfo = await provider.getBlock(endBlock);

    // 重建 PoolKey
    const poolKey = {
      currency0: pool.token0Address,
      currency1: pool.token1Address,
      fee: pool.feeTier,
      tickSpacing: pool.tickSpacing,
      hooks: pool.hooksAddress || ethers.constants.AddressZero,
    };

    // 获取开始和结束时的价格信息
    let priceAtStart = "0";
    let priceAtEnd = "0";

    try {
      const [startPoolInfo, endPoolInfo] = await Promise.all([
        this.getPoolInfoAtBlock(poolKey, startBlock),
        this.getPoolInfoAtBlock(poolKey, endBlock)
      ]);

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
        pool.token1Symbol
      );

      priceAtStart = this.uniswapV4Utils.calculateTickPrice(startPoolInfo.currentTick, token0, token1);
      priceAtEnd = this.uniswapV4Utils.calculateTickPrice(endPoolInfo.currentTick, token0, token1);
    } catch (error) {
      this.logger.warn(`获取 V4 价格信息失败: ${error.message}`);
    }

    // 计算价格变化百分比
    const priceChangePercent = priceAtStart !== "0" && priceAtEnd !== "0"
      ? ((parseFloat(priceAtEnd) - parseFloat(priceAtStart)) / parseFloat(priceAtStart) * 100).toFixed(4)
      : "0";

    // 获取 V4 交易事件来计算手续费收入和交易量
    let feeRevenueToken0 = ethers.BigNumber.from(0);
    let feeRevenueToken1 = ethers.BigNumber.from(0);
    let volumeToken0 = ethers.BigNumber.from(0);
    let volumeToken1 = ethers.BigNumber.from(0);

    try {
      // 获取 V4 Swap 事件
      const swapEvents = await this.uniswapV4Utils.getPoolSwapEvents(
        pool.poolId,
        startBlock,
        endBlock
      );

      // V4 手续费计算 - 使用 lpFee 而不是固定费率
      for (const event of swapEvents) {
        const { amount0, amount1, fee } = event.args;

        // 解析为有符号值
        const signedAmount0 = amount0.fromTwos(128); // V4 使用 int128
        const signedAmount1 = amount1.fromTwos(128);

        // 仅对输入侧计提手续费和统计交易量
        if (signedAmount0.gt(0)) {
          // token0为输入
          volumeToken0 = volumeToken0.add(signedAmount0);
          // V4 的手续费已经在事件中计算好了
          const fee0 = signedAmount0.mul(fee).div(1000000);
          feeRevenueToken0 = feeRevenueToken0.add(fee0);
        } else if (signedAmount1.gt(0)) {
          // token1为输入
          volumeToken1 = volumeToken1.add(signedAmount1);
          const fee1 = signedAmount1.mul(fee).div(1000000);
          feeRevenueToken1 = feeRevenueToken1.add(fee1);
        }
      }
    } catch (error) {
      this.logger.warn(`获取 V4 交易事件失败: ${error.message}`);
    }

    // 获取流动性信息
    let totalLiquidity = "0";
    try {
      const poolInfo = await this.uniswapV4Utils.getPoolInfo(poolKey);
      totalLiquidity = poolInfo.totalLiquidity;
    } catch (error) {
      this.logger.warn(`获取 V4 流动性信息失败: ${error.message}`);
    }

    // 计算USDT价值
    const feeRevenueUsd = await this.calculateUsdtValue(
      pool,
      feeRevenueToken0.toString(),
      feeRevenueToken1.toString(),
      parseInt(priceAtEnd) || 0
    );

    const volumeUsd = await this.calculateUsdtValue(
      pool,
      volumeToken0.toString(),
      volumeToken1.toString(),
      parseInt(priceAtEnd) || 0
    );

    return {
      poolAddress: pool.poolId, // 使用 poolId 作为标识
      date,
      blockNumber: endBlock.toString(),
      blockTimestamp: new Date(endBlockInfo.timestamp * 1000),
      feeRevenueToken0: feeRevenueToken0.toString(),
      feeRevenueToken1: feeRevenueToken1.toString(),
      feeRevenueToken0Formatted: this.uniswapV4Utils.formatTokenAmount(feeRevenueToken0, pool.token0Decimals),
      feeRevenueToken1Formatted: this.uniswapV4Utils.formatTokenAmount(feeRevenueToken1, pool.token1Decimals),
      liquidityChange: "0", // 暂时设为0，后续可以计算
      totalLiquidity,
      priceAtStart,
      priceAtEnd,
      priceChangePercent,
      volumeToken0: volumeToken0.toString(),
      volumeToken1: volumeToken1.toString(),
      volumeToken0Formatted: this.uniswapV4Utils.formatTokenAmount(volumeToken0, pool.token0Decimals),
      volumeToken1Formatted: this.uniswapV4Utils.formatTokenAmount(volumeToken1, pool.token1Decimals),
      feeRevenueUsd: feeRevenueUsd.toString(),
      volumeUsd: volumeUsd.toString(),
    };
  }

  /**
   * 获取指定区块的池子信息
   */
  private async getPoolInfoAtBlock(poolKey: any, blockNumber: number) {
    try {
      // V4 的 PoolManager 合约应该支持历史查询
      const provider = new ethers.providers.JsonRpcProvider(
        this.configService.get<string>("ethereum.rpcUrl")
      );

      const poolManagerAddress = this.configService.get<string>("ethereum.poolManagerAddress");
      const poolManager = new ethers.Contract(
        poolManagerAddress,
        [
          "function getSlot0(bytes32 id) external view returns (uint160 sqrtPriceX96, int24 tick, uint8 protocolFee, uint24 lpFee)"
        ],
        provider
      );

      const poolId = this.uniswapV4Utils.calculatePoolId(poolKey);
      const [sqrtPriceX96, currentTick, protocolFee, lpFee] = await poolManager.getSlot0(
        poolId,
        { blockTag: blockNumber }
      );

      return {
        currentTick: typeof currentTick === 'number' ? currentTick : currentTick.toNumber(),
        sqrtPriceX96: sqrtPriceX96.toString(),
        protocolFee,
        lpFee,
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
   * 获取指定日期的区块范围
   */
  private async getDayBlockRange(date: string) {
    const provider = new ethers.providers.JsonRpcProvider(
      this.configService.get<string>("ethereum.rpcUrl")
    );

    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const startBlock = await this.getBlockByTimestamp(startOfDay);
    const endBlock = await this.getBlockByTimestamp(endOfDay);

    return { startBlock, endBlock };
  }

  /**
   * 根据时间戳获取区块号
   */
  private async getBlockByTimestamp(timestamp: Date): Promise<number> {
    const provider = new ethers.providers.JsonRpcProvider(
      this.configService.get<string>("ethereum.rpcUrl")
    );

    const targetTimestamp = Math.floor(timestamp.getTime() / 1000);
    const latestBlock = await provider.getBlock("latest");

    // 二分查找最接近的区块
    let low = 0;
    let high = latestBlock.number;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const block = await provider.getBlock(mid);

      if (block.timestamp === targetTimestamp) {
        return mid;
      } else if (block.timestamp < targetTimestamp) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return high; // 返回最接近但不超过目标时间戳的区块
  }

  /**
   * 计算USDT价值 (与V3相同的逻辑)
   */
  private async calculateUsdtValue(
    pool: PoolV4,
    token0Amount: string,
    token1Amount: string,
    currentTick: number
  ): Promise<number> {
    const amount0 = parseFloat(this.uniswapV4Utils.formatTokenAmount(
      ethers.BigNumber.from(token0Amount),
      pool.token0Decimals
    ));
    const amount1 = parseFloat(this.uniswapV4Utils.formatTokenAmount(
      ethers.BigNumber.from(token1Amount),
      pool.token1Decimals
    ));

    let usdtValue = 0;

    // 创建Token实例
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
      pool.token1Symbol
    );

    // 获取当前tick对应的价格
    const price = this.uniswapV4Utils.calculateTickPrice(currentTick, token0, token1);

    // 判断哪个是USDT，然后计算价值
    if (pool.token0Symbol.toUpperCase() === 'USDT') {
      usdtValue = amount0 + (amount1 / parseFloat(price));
    } else if (pool.token1Symbol.toUpperCase() === 'USDT') {
      usdtValue = (amount0 * parseFloat(price)) + amount1;
    } else if (pool.token0Symbol.toUpperCase() === 'USDC' || pool.token1Symbol.toUpperCase() === 'USDC') {
      if (pool.token0Symbol.toUpperCase() === 'USDC') {
        usdtValue = amount0 + (amount1 / parseFloat(price));
      } else {
        usdtValue = (amount0 * parseFloat(price)) + amount1;
      }
    } else {
      // 其他情况使用固定价格映射
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
