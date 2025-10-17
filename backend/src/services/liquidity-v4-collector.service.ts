import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ethers } from "ethers";
import { Token } from "@uniswap/sdk-core";
import { PoolV4 } from "../entities/pool-v4.entity";
import { TickLiquidity } from "../entities/tick-liquidity.entity";
import { UniswapV4Utils } from "../utils/uniswap-v4.utils";
import { UniswapV3LiquidityCalculator } from "../utils/uniswap-v3-liquidity-calculator";
import { ConfigService } from "@nestjs/config";
import { batchFetchTicks } from "../utils/uniswap-v3-liquidity-calculator";

@Injectable()
export class LiquidityV4CollectorService {
  private readonly logger = new Logger(LiquidityV4CollectorService.name);
  private liquidityCalculator: UniswapV3LiquidityCalculator;

  constructor(
    @InjectRepository(PoolV4)
    private poolV4Repository: Repository<PoolV4>,
    @InjectRepository(TickLiquidity)
    private tickLiquidityRepository: Repository<TickLiquidity>,
    private configService: ConfigService,
  ) {
    this.liquidityCalculator = new UniswapV3LiquidityCalculator();
  }

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
      "function getTickBitmap(bytes32 poolId, int16 tick) external view returns (uint256 tickBitmap)",
      "function getTickLiquidity(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet)",
      "function getTickInfo(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128)",
      "function getFeeGrowthGlobals(bytes32 poolId) external view returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1)"
    ];

    return new ethers.Contract(config.stateViewAddress, stateViewABI, provider);
  }

  /**
   * 根据 chainId 获取 RPC URL
   */
  private getRpcUrl(chainId: number): string {
    const getConfig = this.configService.get<Function>("ethereum.getConfig");
    const config = getConfig(chainId);

    return config.rpcUrl;
  }

  /**
   * 根据 chainId 获取 Pool Manager 地址
   */
  private getPoolManagerAddress(chainId: number): string {
    const getConfig = this.configService.get<Function>("ethereum.getConfig");
    const config = getConfig(chainId);

    return config.poolManagerAddress;
  }

  /**
   * 定时收集 V4 流动性数据
   */
  @Cron(CronExpression.EVERY_DAY_AT_1AM) // 避免与V3收集时间冲突
  async collectV4LiquidityData() {
    this.logger.log("开始收集 V4 流动性数据...");

    try {
      const pools = await this.poolV4Repository.find({
        where: { isActive: true },
      });

      for (const pool of pools) {
        await this.collectPoolData(pool);
      }

      this.logger.log("V4 流动性数据收集完成");
    } catch (error) {
      this.logger.error("收集 V4 流动性数据失败:", error);
    }
  }

  /**
   * 收集单个 V4 池子的数据（使用 StateView）
   */
  async collectPoolData(pool: PoolV4) {
    try {
      this.logger.log(`开始收集 V4 池子 ${pool.poolId} (Chain ${pool.chainId}) 的数据`);

      // 根据池子的 chainId 获取工具类和合约
      const uniswapV4Utils = this.getUniswapV4Utils(pool.chainId);
      const stateViewContract = this.getStateViewContract(pool.chainId);

      // 使用 StateView 直接获取池子状态
      try {
        const slot0 = await stateViewContract.getSlot0(pool.poolId);
        const liquidity = await stateViewContract.getLiquidity(pool.poolId);

        const poolInfo = {
          poolId: pool.poolId,
          currentTick: parseInt(slot0.tick),
          currentSqrtPriceX96: slot0.sqrtPriceX96.toString(),
          totalLiquidity: liquidity.toString(),
          protocolFee: slot0.protocolFee,
          lpFee: slot0.lpFee,
          tickSpacing: pool.tickSpacing
        };

        this.logger.log(`成功获取 V4 池子 ${pool.poolId} 的链上信息: tick=${poolInfo.currentTick}, liquidity=${poolInfo.totalLiquidity}`);

        // 更新池子信息
        await this.updatePoolInfo(pool, poolInfo);

        // 扫描并存储tick数据 - 传递工具类实例
        await this.scanAndStoreV4Ticks(pool, poolInfo, uniswapV4Utils, stateViewContract);

      } catch (error) {
        this.logger.warn(`无法获取 V4 池子 ${pool.poolId} 的链上数据，跳过数据收集: ${error.message}`);
        // 不抛出错误，允许其他池子继续处理
        return {
          success: false,
          message: "V4 StateView 数据获取失败，可能是合约未部署或网络问题",
          poolId: pool.poolId,
        };
      }

      this.logger.log(`V4 池子 ${pool.poolId} 数据收集完成`);
      return {
        success: true,
        message: "V4 数据收集成功",
        poolId: pool.poolId,
      };
    } catch (error) {
      this.logger.error(`收集 V4 池子 ${pool.poolId} 数据失败:`, error);
      throw error;
    }
  }

  /**
   * 更新 V4 池子信息
   */
  private async updatePoolInfo(pool: PoolV4, poolInfo: any) {
    pool.currentTick = poolInfo.currentTick;
    pool.currentSqrtPriceX96 = poolInfo.currentSqrtPriceX96;
    pool.totalLiquidity = poolInfo.totalLiquidity;

    await this.poolV4Repository.save(pool);
  }

  /**
   * 使用 StateView 查找活跃的 ticks
   * 全区间扫描方式
   */
  private async findActiveTicks(poolId: string, currentTick: number): Promise<number[]> {
    const activeTicks: number[] = [];

    try {
      // 全区间扫描 bitmap（修正范围）
      const MIN_WORD = -3466; // Math.floor(-887272 / 256)
      const MAX_WORD = 3466;   // Math.floor(887272 / 256)

      this.logger.log(`V4 全区间扫描 tickBitmap，范围: ${MIN_WORD} 到 ${MAX_WORD} words (对应 tick -887272 到 887272)`);

      let scannedWords = 0;
      let foundActiveWords = 0;

      // 优化扫描策略：先快速扫描找到活跃区域，再细致扫描
      for (let word = MIN_WORD; word <= MAX_WORD; word += 20) { // 每20个word扫描一次，快速定位活跃区域

        try {
          const bitmap = await this.stateViewContract.getTickBitmap(poolId, word);
          scannedWords++;

          if (bitmap.gt(0)) {
            foundActiveWords++;
            this.logger.log(`发现活跃区域 Word ${word}: ${bitmap.toString(16).substring(0, 20)}...`);

            // 在这个活跃区域附近进行细致扫描
            for (let nearWord = word - 2; nearWord <= word + 2; nearWord++) {
              try {
                const nearBitmap = await this.stateViewContract.getTickBitmap(poolId, nearWord);

                if (nearBitmap.gt(0)) {
                  this.logger.log(`解析活跃 bitmap Word ${nearWord}: ${nearBitmap.toString(16)}`);

                  // 解析 bitmap 找到具体的 ticks - 使用 BigInt 方法
                  const bitmapBigInt = BigInt(nearBitmap.toString());

                  for (let bit = 0; bit < 256; bit++) {
                    if ((bitmapBigInt >> BigInt(bit)) & BigInt(1)) {
                      const tick = nearWord * 256 + bit;
                      activeTicks.push(tick);

                      // 输出前几个找到的 tick 用于调试
                      if (activeTicks.length <= 20) {
                        this.logger.log(`  发现 tick: ${tick} (bit ${bit} in word ${nearWord})`);
                      }
                    }
                  }
                }
              } catch (error) {
                // 忽略单个 word 的查询错误
              }
            }
          }

          // 每扫描50个words输出一次进度
          if (scannedWords % 50 === 0) {
            this.logger.log(`V4 扫描进度: ${scannedWords}/${Math.floor((MAX_WORD - MIN_WORD) / 20)} words, 发现 ${foundActiveWords} 个活跃区域, ${activeTicks.length} 个 ticks`);
          }

          // 限制找到的数量，避免过多
          if (activeTicks.length >= 2000) {
            this.logger.log(`达到最大 tick 数量限制 (2000)，停止扫描`);
            break;
          }

        } catch (error) {
          // 继续扫描其他 word
        }
      }

      // 去重并排序
      const uniqueTicks = [...new Set(activeTicks)].sort((a, b) => a - b);
      this.logger.log(`V4 全区间扫描完成: 扫描 ${scannedWords} words，发现 ${foundActiveWords} 个活跃区域，找到 ${uniqueTicks.length} 个唯一的活跃 ticks`);

      if (uniqueTicks.length > 0) {
        const tickRange = {
          min: Math.min(...uniqueTicks),
          max: Math.max(...uniqueTicks)
        };
        this.logger.log(`V4 活跃 tick 范围: ${tickRange.min} 到 ${tickRange.max}`);
      }

      return uniqueTicks;

    } catch (error) {
      this.logger.error(`V4 全区间扫描失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 使用 StateView 扫描并存储 V4 tick数据
   * 基于 tickBitmap 的高效扫描方式
   */
  private async scanAndStoreV4Ticks(pool: PoolV4, poolInfo: any) {
    const provider = new ethers.providers.JsonRpcProvider(
      this.configService.get<string>("ethereum.rpcUrl"),
    );
    const latestBlock = await provider.getBlock("latest");

    this.logger.log(`使用 StateView 扫描 V4 池子 ${pool.poolId} 的 tick 数据`);

    try {
      // 1. 获取当前池子状态
      const slot0 = await this.stateViewContract.getSlot0(pool.poolId);
      const currentTick = parseInt(slot0.tick);
      const totalLiquidity = await this.stateViewContract.getLiquidity(pool.poolId);

      this.logger.log(`当前 tick: ${currentTick}, 总流动性: ${totalLiquidity.toString()}`);

      // 更新池子状态
      pool.currentTick = currentTick;
      pool.currentSqrtPriceX96 = slot0.sqrtPriceX96.toString();
      pool.totalLiquidity = totalLiquidity.toString();

      // 如果是空池子，直接返回
      if (totalLiquidity.eq(0)) {
        this.logger.log(`空池子，无需计算流动性分布`);

        pool.currentTick = currentTick;
        pool.currentSqrtPriceX96 = slot0.sqrtPriceX96.toString();
        pool.totalLiquidity = "0";
        pool.totalAmount0 = "0";
        pool.totalAmount1 = "0";

        await this.poolV4Repository.save(pool);
        return;
      }

      // 🔥 首先尝试从数据库获取已有的 tick 数据并重新计算价格
      const existingTickData = await this.getExistingV4TickData(pool.poolId, 23388479);

      if (existingTickData.length > 0) {
        this.logger.log(`从数据库获取到 ${existingTickData.length} 条块高 23388479 的 tick 数据，重新计算价格和代币数量`);

        const recalculatedData = await this.recalculateV4TickData(existingTickData, pool, currentTick, slot0.sqrtPriceX96);

        if (recalculatedData.length > 0) {
          // 更新数据库中的价格和代币数量
          await this.updateV4TickData(recalculatedData);

          // 重新计算池子的总代币数量
          let totalAmount0 = ethers.BigNumber.from(0);
          let totalAmount1 = ethers.BigNumber.from(0);

          for (const item of recalculatedData) {
            totalAmount0 = totalAmount0.add(ethers.BigNumber.from(item.token0Amount));
            totalAmount1 = totalAmount1.add(ethers.BigNumber.from(item.token1Amount));
          }

          // 更新池子信息
          pool.currentTick = currentTick;
          pool.currentSqrtPriceX96 = slot0.sqrtPriceX96.toString();
          pool.totalLiquidity = totalLiquidity.toString();
          pool.totalAmount0 = totalAmount0.toString();
          pool.totalAmount1 = totalAmount1.toString();

          await this.poolV4Repository.save(pool);

          this.logger.log(`V4 池子 ${pool.poolId} 价格和代币数量重新计算完成:`);
          this.logger.log(`  Token0: ${this.uniswapV4Utils.formatTokenAmount(totalAmount0, pool.token0Decimals)}`);
          this.logger.log(`  Token1: ${this.uniswapV4Utils.formatTokenAmount(totalAmount1, pool.token1Decimals)}`);
          this.logger.log(`  重新计算的Ticks: ${recalculatedData.length}`);

          return;
        }
      }

      // 如果没有已有数据，继续原有的扫描流程
      this.logger.log(`未找到块高 23388479 的已有数据，继续扫描流程`);

      let initializedTicks: any[] = [];
      initializedTicks = await this.findTicksFromEvents(pool.poolId, pool.tickSpacing);

      if (initializedTicks.length === 0) {
        this.logger.warn(`未找到任何有流动性的 tick`);
        return;
      }

      this.logger.log(`找到 ${initializedTicks.length} 个有流动性的 tick`);

      // 🔥 使用修复后的流动性分布计算
      const liquidityDistribution = await this.calculateV4LiquidityDistribution(
        initializedTicks,
        currentTick,
        slot0.sqrtPriceX96,
        pool
      );

      this.logger.log(`计算得到 ${liquidityDistribution.length} 个流动性区间`);

      // 计算总代币数量
      let totalAmount0 = ethers.BigNumber.from(0);
      let totalAmount1 = ethers.BigNumber.from(0);

      for (const item of liquidityDistribution) {
        totalAmount0 = totalAmount0.add(ethers.BigNumber.from(item.token0Amount));
        totalAmount1 = totalAmount1.add(ethers.BigNumber.from(item.token1Amount));
      }

      // 更新池子信息
      pool.currentTick = currentTick;
      pool.currentSqrtPriceX96 = slot0.sqrtPriceX96.toString();
      pool.totalLiquidity = totalLiquidity.toString();
      pool.totalAmount0 = totalAmount0.toString();
      pool.totalAmount1 = totalAmount1.toString();

      await this.poolV4Repository.save(pool);

      // 存储 tick 数据
      if (liquidityDistribution.length > 0) {
        await this.insertTickLiquidity(liquidityDistribution);
        this.logger.log(`成功存储 ${liquidityDistribution.length} 条 V4 tick 数据`);
      }

      this.logger.log(`V4 池子 ${pool.poolId} 总代币数量计算完成:`);
      this.logger.log(`  Token0: ${this.uniswapV4Utils.formatTokenAmount(totalAmount0, pool.token0Decimals)}`);
      this.logger.log(`  Token1: ${this.uniswapV4Utils.formatTokenAmount(totalAmount1, pool.token1Decimals)}`);
      this.logger.log(`  处理的Ticks: ${initializedTicks.length}`);


    } catch (error) {
      this.logger.error(`V4 StateView 数据扫描失败: ${error.message}`);
      // 不抛出错误，允许继续处理其他池子
    }
  }

  /**
   * V4 专用的批量获取 tick 数据
   * 需要传入 poolId 而不是池子地址
   */
  private async batchFetchV4Ticks(
    poolId: string,
    tickList: number[],
    abi: string[],
    rpcUrl: string
  ): Promise<any[]> {
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const poolManagerAddress = this.configService.get<string>("ethereum.poolManagerAddress");
    const poolManager = new ethers.Contract(poolManagerAddress, abi, provider);

    const batchSize = 500;
    const results: any[] = [];

    const totalBatches = Math.ceil(tickList.length / batchSize);

    for (let i = 0; i < tickList.length; i += batchSize) {
      const batch = tickList.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;

      this.logger.log(`🔥 批量扫描进度: ${currentBatch}/${totalBatches} (${((currentBatch / totalBatches) * 100).toFixed(1)}%), 处理 tick ${i} 到 ${Math.min(i + batchSize - 1, tickList.length - 1)}`);

      const promises = batch.map(tick =>
        poolManager.ticks(poolId, tick).catch(() => ({
          liquidityGross: ethers.BigNumber.from(0),
          liquidityNet: ethers.BigNumber.from(0),
          initialized: false
        }))
      );

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);

      this.logger.log(`✅ 批量 ${currentBatch} 完成，获取到 ${batchResults.length} 个结果`);

      // 添加延迟避免RPC请求过于频繁
      if (i + batchSize < tickList.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * 批量更新或插入 V4 tick流动性数据
   */
  private async insertTickLiquidity(tickDataArray: any[]) {
    try {
      await this.tickLiquidityRepository.save(tickDataArray);
    } catch (error) {
      this.logger.error("批量插入 V4 tick数据失败:", error);
      throw error;
    }
  }

  /**
   * 获取 V4 池子所有 tick 数据
   */
  async getAllPoolV4Liquidity(poolId: string) {
    // 获取最新块
    const latest = await this.tickLiquidityRepository
      .createQueryBuilder('tick')
      .select('MAX(tick.blockNumber)', 'max_block')
      .where('tick.poolId = :poolId', { poolId })
      .getRawOne();
    const selectedBlock = latest?.max_block ?? null;

    const qb = this.tickLiquidityRepository
      .createQueryBuilder('tick')
      .where('tick.poolId = :poolId', { poolId })
      .andWhere('tick.version = :version', { version: 'v4' });

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
   * 手动触发 V4 数据收集
   */
  async manualCollectV4(poolId: string) {
    const pool = await this.poolV4Repository.findOne({
      where: { poolId },
    });
    if (!pool) {
      throw new Error("V4 Pool not found");
    }

    this.collectPoolData(pool);

    return {
      data: [],
      message: "V4 Data collection triggered",
    };
  }

  /**
   * 全面诊断 V4 流动性问题
   */
  private async comprehensiveDiagnosis(pool: PoolV4) {
    this.logger.log(`\n🔬 开始全面诊断 V4 池子问题:`);
    this.logger.log(`   Pool ID: ${pool.poolId}`);
    this.logger.log(`   StateView 地址: ${this.stateViewContract.address}`);

    // 第一步：验证合约和网络
    await this.verifyContractAndNetwork();

    // 第二步：验证池子基础数据
    await this.verifyPoolBasicData(pool);

    // 第三步：测试不同的查询方法
    await this.testDifferentQueryMethods(pool);

    // 第四步：对比其他已知工作的池子
    await this.compareWithWorkingPools(pool);

    // 第五步：原始存储读取测试
    await this.testRawStorageAccess(pool);
  }

  /**
   * 验证合约和网络连接
   */
  private async verifyContractAndNetwork() {
    this.logger.log(`\n1️⃣ 验证合约和网络连接:`);

    try {
      // 检查合约代码
      const code = await this.stateViewContract.provider.getCode(this.stateViewContract.address);
      this.logger.log(`   合约代码长度: ${code.length} 字符`);

      if (code === '0x' || code.length < 100) {
        this.logger.error(`   ❌ 合约地址无效或无代码`);
        return false;
      }

      // 检查网络
      const network = await this.stateViewContract.provider.getNetwork();
      this.logger.log(`   网络 ID: ${network.chainId}`);
      this.logger.log(`   网络名称: ${network.name}`);

      // 检查最新区块
      const latestBlock = await this.stateViewContract.provider.getBlock('latest');
      this.logger.log(`   最新区块: ${latestBlock.number}`);
      this.logger.log(`   区块时间: ${new Date(latestBlock.timestamp * 1000).toISOString()}`);

      // 测试基础方法调用
      try {
        const testCall = await this.stateViewContract.provider.call({
          to: this.stateViewContract.address,
          data: "0x" // 简单的调用测试
        });
        this.logger.log(`   ✅ StateView 合约可以正常调用`);
      } catch (error) {
        this.logger.error(`   ❌ StateView 合约调用失败: ${error.message}`);
        return false;
      }

      return true;

    } catch (error) {
      this.logger.error(`   ❌ 验证过程失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 验证池子基础数据
   */
  private async verifyPoolBasicData(pool: PoolV4) {
    this.logger.log(`\n2️⃣ 验证池子基础数据:`);

    try {
      // 获取基础状态
      const slot0 = await this.stateViewContract.getSlot0(pool.poolId);
      const liquidity = await this.stateViewContract.getLiquidity(pool.poolId);

      this.logger.log(`   ✅ getSlot0 成功:`);
      this.logger.log(`     sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
      this.logger.log(`     tick: ${slot0.tick.toString()}`);
      this.logger.log(`     protocolFee: ${slot0.protocolFee}`);
      this.logger.log(`     lpFee: ${slot0.lpFee}`);

      this.logger.log(`   ✅ getLiquidity 成功: ${liquidity.toString()}`);

      // 检查是否为空池子
      if (liquidity.eq(0)) {
        this.logger.warn(`   ⚠️ 池子总流动性为 0 - 这解释了为什么找不到活跃 tick`);

        // 即使总流动性为0，也可能有历史位置，继续检查
        this.logger.log(`   📝 继续检查是否有历史流动性位置...`);
      }

      // 验证 tick 的合理性
      const currentTick = parseInt(slot0.tick.toString());
      const minTick = -887272;
      const maxTick = 887272;

      if (currentTick < minTick || currentTick > maxTick) {
        this.logger.error(`   ❌ 当前 tick ${currentTick} 超出有效范围 [${minTick}, ${maxTick}]`);
      } else {
        this.logger.log(`   ✅ 当前 tick ${currentTick} 在有效范围内`);
      }

    } catch (error) {
      this.logger.error(`   ❌ 获取池子基础数据失败: ${error.message}`);
    }
  }

  /**
   * 测试不同的查询方法
   */
  private async testDifferentQueryMethods(pool: PoolV4) {
    this.logger.log(`\n3️⃣ 测试不同的查询方法:`);

    const currentTick = pool.currentTick;
    const alignedTick = Math.floor(currentTick / pool.tickSpacing) * pool.tickSpacing;

    // 测试的 tick 列表
    const testTicks = [
      0,                    // 原点
      alignedTick,          // 对齐的当前 tick
      currentTick,          // 实际当前 tick
      alignedTick - pool.tickSpacing,  // 下一个对齐 tick
      alignedTick + pool.tickSpacing,  // 上一个对齐 tick
      -20320,               // 从 bitmap 中找到的活跃 tick
      -20280,               // 另一个活跃 tick
    ];

    this.logger.log(`   测试 ticks: [${testTicks.join(', ')}]`);

    for (const tick of testTicks) {
      this.logger.log(`\n   🔍 详细测试 tick ${tick}:`);

      // 方法1: getTickInfo
      try {
        const result = await this.stateViewContract.getTickInfo(pool.poolId, tick);
        this.logger.log(`     getTickInfo: gross=${result.liquidityGross.toString()}, net=${result.liquidityNet.toString()}`);

        if (result.liquidityGross.gt(0)) {
          this.logger.log(`     🎉 找到有流动性的 tick: ${tick}`);
        }
      } catch (error) {
        this.logger.log(`     getTickInfo 失败: ${error.message.split('(')[0]}`);
      }

      // 方法2: getTickLiquidity
      try {
        const result = await this.stateViewContract.getTickLiquidity(pool.poolId, tick);
        this.logger.log(`     getTickLiquidity: gross=${result.liquidityGross.toString()}, net=${result.liquidityNet.toString()}`);
      } catch (error) {
        this.logger.log(`     getTickLiquidity 失败: ${error.message.split('(')[0]}`);
      }

      // 方法3: 检查对应的 bitmap
      try {
        const wordIndex = Math.floor(tick / 256);
        const bitIndex = tick >= 0 ? tick % 256 : 256 + (tick % 256);
        const bitmap = await this.stateViewContract.getTickBitmap(pool.poolId, wordIndex);
        const bitmapBigInt = BigInt(bitmap.toString());
        const isBitSet = (bitmapBigInt >> BigInt(bitIndex)) & BigInt(1);

        this.logger.log(`     bitmap: word=${wordIndex}, bit=${bitIndex}, set=${!!isBitSet}, bitmap=${bitmap.toString()}`);

        // 检查 bitmap 和流动性数据的一致性将在其他地方处理
      } catch (error) {
        this.logger.log(`     bitmap 查询失败: ${error.message.split('(')[0]}`);
      }
    }
  }

  /**
   * 原始存储读取测试
   */
  private async testRawStorageAccess(pool: PoolV4) {
    this.logger.log(`\n4️⃣ 原始存储访问测试:`);

    try {
      // 尝试使用 PoolManager 直接查询（如果 StateView 有问题）
      const poolManagerAddress = this.configService.get<string>("ethereum.poolManagerAddress");

      if (poolManagerAddress) {
        this.logger.log(`   尝试直接访问 PoolManager: ${poolManagerAddress}`);

        const poolManagerABI = [
          "function slot0(bytes32 poolId) external view returns (uint160, int24, uint24, uint24)",
          "function getLiquidity(bytes32 poolId) external view returns (uint128)",
        ];

        const poolManager = new ethers.Contract(
          poolManagerAddress,
          poolManagerABI,
          this.stateViewContract.provider
        );

        try {
          const slot0 = await poolManager.slot0(pool.poolId);
          this.logger.log(`     PoolManager slot0: tick=${slot0[1]}, price=${slot0[0].toString()}`);

          const liquidity = await poolManager.getLiquidity(pool.poolId);
          this.logger.log(`     PoolManager liquidity: ${liquidity.toString()}`);

          // 对比 StateView 和 PoolManager 的结果
          const stateViewSlot0 = await this.stateViewContract.getSlot0(pool.poolId);
          const stateViewLiquidity = await this.stateViewContract.getLiquidity(pool.poolId);

          if (slot0[1].toString() !== stateViewSlot0.tick.toString()) {
            this.logger.error(`     🚨 tick 不一致！PoolManager: ${slot0[1]}, StateView: ${stateViewSlot0.tick}`);
          }

          if (liquidity.toString() !== stateViewLiquidity.toString()) {
            this.logger.error(`     🚨 liquidity 不一致！PoolManager: ${liquidity}, StateView: ${stateViewLiquidity}`);
          }

        } catch (error) {
          this.logger.log(`     PoolManager 查询失败: ${error.message.split('(')[0]}`);
        }
      }

    } catch (error) {
      this.logger.error(`   原始存储访问失败: ${error.message}`);
    }
  }

  /**
   * 针对空池子的特殊处理
   */
  private async handleEmptyPool(pool: PoolV4) {
    this.logger.log(`\n5️⃣ 空池子专项分析:`);

    // 1. 检查是否曾经有过流动性（历史事件）
    this.logger.log(`   检查历史流动性事件...`);

    try {
      const poolManagerAddress = this.configService.get<string>("ethereum.poolManagerAddress");
      const poolManager = new ethers.Contract(
        poolManagerAddress,
        [
          "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)"
        ],
        this.stateViewContract.provider
      );

      // 查询最近1000个区块的事件
      const currentBlock = await this.stateViewContract.provider.getBlock('latest');
      const fromBlock = Math.max(0, currentBlock.number - 1000);

      const filter = poolManager.filters.ModifyLiquidity(pool.poolId);
      const events = await poolManager.queryFilter(filter, fromBlock, currentBlock.number);

      this.logger.log(`   找到 ${events.length} 个历史流动性事件`);

      if (events.length > 0) {
        for (const event of events.slice(0, 5)) { // 只显示前5个
          const { tickLower, tickUpper, liquidityDelta } = event.args;
          this.logger.log(`     事件: tick范围[${tickLower}, ${tickUpper}], 流动性变化=${liquidityDelta.toString()}`);

          // 测试这些历史 tick
          for (const tick of [tickLower, tickUpper]) {
            try {
              const tickInfo = await this.stateViewContract.getTickInfo(pool.poolId, tick);
              if (tickInfo.liquidityGross.gt(0)) {
                this.logger.log(`     🎉 历史 tick ${tick} 仍有流动性: ${tickInfo.liquidityGross.toString()}`);
              }
            } catch (error) {
              // 忽略错误
            }
          }
        }
      } else {
        this.logger.log(`   ✅ 确认池子从未有过流动性，这是正常的空池子`);
      }

    } catch (error) {
      this.logger.log(`   历史事件查询失败: ${error.message}`);
    }
  }

  /**
   * 比较不同合约的结果
   */
  private async compareWithWorkingPools(pool: PoolV4) {
    this.logger.log(`\n🔄 比较不同数据源:`);

    try {
      // 测试是否是 StateView 合约的问题
      this.logger.log(`   测试假设：StateView 可能返回过时或错误的数据`);

      // 检查 StateView 合约的版本或实现
      try {
        // 尝试调用可能存在的版本方法
        const testMethods = [
          'version',
          'VERSION',
          'getVersion',
          'implementation'
        ];

        for (const method of testMethods) {
          try {
            const contract = new ethers.Contract(
              this.stateViewContract.address,
              [`function ${method}() external view returns (string)`],
              this.stateViewContract.provider
            );
            const result = await contract[method]();
            this.logger.log(`     StateView ${method}: ${result}`);
          } catch (error) {
            // 忽略方法不存在的错误
          }
        }
      } catch (error) {
        this.logger.log(`     无法获取 StateView 版本信息`);
      }

      // 测试 bitmap 数据的准确性
      this.logger.log(`   🧪 深度测试 bitmap 数据准确性:`);

      const testWord = -80; // 已知有活跃数据的 word
      const bitmap = await this.stateViewContract.getTickBitmap(pool.poolId, testWord);
      const bitmapBigInt = BigInt(bitmap.toString());

      this.logger.log(`     Word ${testWord} bitmap: ${bitmap.toString()}`);
      this.logger.log(`     Bitmap hex: 0x${bitmapBigInt.toString(16)}`);

      // 统计设置的 bits
      let setBitsCount = 0;
      const setBits: number[] = [];

      for (let bit = 0; bit < 256; bit++) {
        if ((bitmapBigInt >> BigInt(bit)) & BigInt(1)) {
          setBitsCount++;
          setBits.push(bit);
        }
      }

      this.logger.log(`     设置的 bits 总数: ${setBitsCount}`);
      this.logger.log(`     前10个设置的 bits: [${setBits.slice(0, 10).join(', ')}]`);

      // 检查这些 bits 对应的 ticks
      let ticksWithLiquidity = 0;

      for (const bit of setBits.slice(0, 10)) {
        const tick = testWord * 256 + bit;

        try {
          const tickInfo = await this.stateViewContract.getTickInfo(pool.poolId, tick);
          if (tickInfo.liquidityGross.gt(0)) {
            ticksWithLiquidity++;
            this.logger.log(`     ✅ Tick ${tick} 确实有流动性: ${tickInfo.liquidityGross.toString()}`);
          } else {
            this.logger.log(`     ❌ Tick ${tick} bitmap显示活跃但无流动性`);
          }
        } catch (error) {
          this.logger.log(`     ❌ Tick ${tick} 查询失败: ${error.message.split('(')[0]}`);
        }
      }

      this.logger.log(`     📊 统计: ${setBitsCount} 个活跃 bits, ${ticksWithLiquidity} 个有实际流动性`);

      if (setBitsCount > 0 && ticksWithLiquidity === 0) {
        this.logger.error(`     🚨 严重不一致！所有 bitmap 活跃位都没有对应的流动性数据`);
        this.logger.error(`     这可能表明：`);
        this.logger.error(`       1. StateView 合约实现有 bug`);
        this.logger.error(`       2. PoolId 计算错误`);
        this.logger.error(`       3. 合约版本不匹配`);
        this.logger.error(`       4. 数据同步问题`);
      }

    } catch (error) {
      this.logger.error(`   比较测试失败: ${error.message}`);
    }
  }

  /**
   * 修复版本的调试方法
   */
  private async debugV4TickData(pool: PoolV4) {
    this.logger.log(`🐛 开始调试 V4 池子 ${pool.poolId}`);

    try {
      // 1. 基础连通性测试
      const slot0 = await this.stateViewContract.getSlot0(pool.poolId);
      const liquidity = await this.stateViewContract.getLiquidity(pool.poolId);

      this.logger.log(`✅ 基础数据获取成功:`);
      this.logger.log(`   当前 tick: ${slot0.tick}`);
      this.logger.log(`   当前价格: ${slot0.sqrtPriceX96.toString()}`);
      this.logger.log(`   总流动性: ${liquidity.toString()}`);
      this.logger.log(`   池子 tickSpacing: ${pool.tickSpacing}`);

      // 2. 测试不同的方法来获取 tick 信息
      this.logger.log(`🔧 测试不同的 tick 查询方法:`);

      const testTicks = [-20320, -20310, -20000, -19000]; // 使用活跃范围内的 ticks

      for (const tick of testTicks) {
        // 方法1: getTickLiquidity (2个返回值)
        try {
          const result1 = await this.stateViewContract.getTickLiquidity(pool.poolId, tick);
          this.logger.log(`   getTickLiquidity(${tick}): gross=${result1.liquidityGross.toString()}, net=${result1.liquidityNet.toString()}`);
        } catch (error) {
          this.logger.log(`   getTickLiquidity(${tick}) 失败: ${error.message.split('(')[0]}`);
        }

        // 方法2: getTickInfo (4个返回值)
        try {
          const result2 = await this.stateViewContract.getTickInfo(pool.poolId, tick);
          this.logger.log(`   getTickInfo(${tick}): gross=${result2.liquidityGross.toString()}, net=${result2.liquidityNet.toString()}`);
        } catch (error) {
          this.logger.log(`   getTickInfo(${tick}) 失败: ${error.message.split('(')[0]}`);
        }

        // 方法3: 直接使用原始合约调用测试
        try {
          const rawContract = new ethers.Contract(
            this.stateViewContract.address,
            [
              "function getTickLiquidity(bytes32,int24) external view returns (uint128,int128)",
              "function getTickInfo(bytes32,int24) external view returns (uint128,int128,uint256,uint256)"
            ],
            this.stateViewContract.provider
          );

          const rawResult = await rawContract.getTickLiquidity(pool.poolId, tick);
          this.logger.log(`   原始调用(${tick}): gross=${rawResult[0].toString()}, net=${rawResult[1].toString()}`);
        } catch (error) {
          this.logger.log(`   原始调用(${tick}) 失败: ${error.message.split('(')[0]}`);
        }
      }

      // 3. 验证 tickBitmap 和实际数据的关系
      this.logger.log(`\n🗺️ 深度验证 tickBitmap:`);

      // 测试一个已知活跃的 word
      const testWord = -80; // 日志中显示的活跃 word
      try {
        const bitmap = await this.stateViewContract.getTickBitmap(pool.poolId, testWord);
        this.logger.log(`Word ${testWord} bitmap: ${bitmap.toString()}`);

        if (bitmap.gt(0)) {
          const bitmapBigInt = BigInt(bitmap.toString());
          this.logger.log(`Word ${testWord} bitmap (hex): 0x${bitmapBigInt.toString(16)}`);

          // 找出具体哪些 bit 被设置
          const setBits: number[] = [];
          for (let bit = 0; bit < 256; bit++) {
            if ((bitmapBigInt >> BigInt(bit)) & BigInt(1)) {
              setBits.push(bit);
            }
          }

          this.logger.log(`Word ${testWord} 设置的 bits: [${setBits.slice(0, 10).join(', ')}${setBits.length > 10 ? '...' : ''}]`);

          // 验证前几个对应的 tick
          for (const bit of setBits.slice(0, 5)) {
            const tick = testWord * 256 + bit;
            this.logger.log(`\n   验证 tick ${tick} (bit ${bit}):`);

            try {
              const tickInfo = await this.stateViewContract.getTickInfo(pool.poolId, tick);
              this.logger.log(`     getTickInfo: gross=${tickInfo.liquidityGross.toString()}, net=${tickInfo.liquidityNet.toString()}`);

              if (tickInfo.liquidityGross.gt(0)) {
                this.logger.log(`     🎉 找到有流动性的 tick: ${tick}`);
              } else {
                this.logger.log(`     🤔 tick ${tick} 在 bitmap 中标记为活跃，但 liquidityGross 为 0`);
              }
            } catch (error) {
              this.logger.log(`     ❌ 获取 tick ${tick} 信息失败: ${error.message}`);
            }
          }
        }
      } catch (error) {
        this.logger.log(`Word ${testWord} 查询失败: ${error.message}`);
      }

      // 4. 测试合约地址和网络连接
      this.logger.log(`\n🌐 验证合约连接:`);
      this.logger.log(`   StateView 地址: ${this.stateViewContract.address}`);
      this.logger.log(`   Provider URL: ${this.configService.get<string>("ethereum.rpcUrl")}`);

      try {
        const code = await this.stateViewContract.provider.getCode(this.stateViewContract.address);
        this.logger.log(`   合约代码长度: ${code.length} 字符`);

        if (code === '0x') {
          this.logger.log(`   ❌ 合约地址无代码，可能地址错误或网络不匹配`);
        } else {
          this.logger.log(`   ✅ 合约存在且有代码`);
        }
      } catch (error) {
        this.logger.log(`   ❌ 无法获取合约代码: ${error.message}`);
      }

    } catch (error) {
      this.logger.error(`调试过程失败: ${error.message}`);
    }
  }

  /**
   * 修复版本的获取 tick 信息方法
   */
  private async getTickDetails(poolId: string, tick: number): Promise<any> {
    try {
      // 尝试使用 getTickInfo（推荐方法，返回更多信息）
      const tickInfo = await this.stateViewContract.getTickInfo(poolId, tick);

      return {
        tick,
        liquidityGross: tickInfo.liquidityGross,
        liquidityNet: tickInfo.liquidityNet,
        feeGrowthOutside0X128: tickInfo.feeGrowthOutside0X128,
        feeGrowthOutside1X128: tickInfo.feeGrowthOutside1X128,
        initialized: tickInfo.liquidityGross.gt(0)
      };
    } catch (error) {
      // 如果 getTickInfo 失败，尝试 getTickLiquidity
      try {
        const tickLiquidity = await this.stateViewContract.getTickLiquidity(poolId, tick);

        return {
          tick,
          liquidityGross: tickLiquidity.liquidityGross,
          liquidityNet: tickLiquidity.liquidityNet,
          initialized: tickLiquidity.liquidityGross.gt(0)
        };
      } catch (innerError) {
        this.logger.warn(`获取 tick ${tick} 详情失败: ${error.message}, ${innerError.message}`);
        return null;
      }
    }
  }

  /**
   * 修复版本的 findActiveTicks，包含 tickSpacing 对齐
   */
  private async findActiveTicksFixed(poolId: string, currentTick: number, tickSpacing: number): Promise<number[]> {
    const activeTicks: number[] = [];

    try {
      // 重点扫描已知的活跃区域
      const knownActiveWords = [-140, -138, -130, -129, -100, -105, -102, -95, -80, -84, -81, -79, -78, -77, -76, -75];

      this.logger.log(`🎯 重点扫描已知活跃区域 (tickSpacing=${tickSpacing})`);

      for (const word of knownActiveWords) {
        try {
          const bitmap = await this.stateViewContract.getTickBitmap(poolId, word);

          if (bitmap.gt(0)) {
            this.logger.log(`✅ Word ${word} 有活跃 ticks`);

            // 使用 BigInt 解析 bitmap
            const bitmapBigInt = BigInt(bitmap.toString());

            for (let bit = 0; bit < 256; bit++) {
              if ((bitmapBigInt >> BigInt(bit)) & BigInt(1)) {
                const tick = word * 256 + bit;

                // 🔥 关键修复：确保 tick 对齐到 tickSpacing
                if (tick % tickSpacing === 0) {
                  activeTicks.push(tick);
                }
              }
            }
          }
        } catch (error) {
          this.logger.warn(`Word ${word} 查询失败: ${error.message}`);
        }
      }

      // 去重并排序
      const uniqueTicks = [...new Set(activeTicks)].sort((a, b) => a - b);
      this.logger.log(`重点扫描完成: 找到 ${uniqueTicks.length} 个对齐的活跃 ticks`);

      if (uniqueTicks.length > 0) {
        const tickRange = {
          min: Math.min(...uniqueTicks),
          max: Math.max(...uniqueTicks)
        };
        this.logger.log(`活跃 tick 范围: ${tickRange.min} 到 ${tickRange.max}`);
      }

      return uniqueTicks;

    } catch (error) {
      this.logger.error(`findActiveTicksFixed 失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 从事件日志中查找有流动性的 tick（更可靠的方法）
   */
  private async findTicksFromEvents(poolId: string, tickSpacing: number): Promise<any[]> {
    this.logger.log(`通过事件日志查找有流动性的 tick...`);

    try {
      const poolManagerAddress = this.configService.get<string>("ethereum.poolManagerAddress");
      this.logger.log(`使用 PoolManager 地址: ${poolManagerAddress}`);

      // 扩大查询范围
      const currentBlock = await this.stateViewContract.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 200000); // 扩大到最近20万个区块

      this.logger.log(`查询区块范围: ${fromBlock} 到 ${currentBlock} (共 ${currentBlock - fromBlock} 个区块)`);

      let allEvents: any[] = [];

      // 分别尝试不同的事件类型，避免 ABI 冲突
      const eventConfigs = [
        {
          name: 'ModifyLiquidity',
          abi: ["event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)"],
          hasPoolId: true
        },
        {
          name: 'ModifyPosition',
          abi: ["event ModifyPosition(bytes32 indexed poolId, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta)"],
          hasPoolId: true
        },
        {
          name: 'Mint',
          abi: ["event Mint(address indexed sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)"],
          hasPoolId: false
        }
      ];

      // 尝试不同的事件类型
      for (const config of eventConfigs) {
        try {
          const eventContract = new ethers.Contract(
            poolManagerAddress,
            config.abi,
            this.stateViewContract.provider
          );

          let filter;
          if (config.hasPoolId) {
            filter = eventContract.filters[config.name](poolId);
          } else {
            filter = eventContract.filters[config.name]();
          }

          const events = await eventContract.queryFilter(filter, fromBlock, currentBlock);
          this.logger.log(`${config.name} 事件找到 ${events.length} 个`);

          if (events.length > 0) {
            allEvents = allEvents.concat(events);
          }
        } catch (error) {
          this.logger.log(`${config.name} 事件查询失败: ${error.message.split('(')[0]}`);
        }
      }

      this.logger.log(`总共找到 ${allEvents.length} 个流动性相关事件`);

      // 收集所有涉及的 ticks
      const tickSet = new Set<number>();

      for (const event of allEvents) {
        try {
          const args = event.args;

          // 根据事件类型提取 tick 信息
          if (args.tickLower !== undefined && args.tickUpper !== undefined) {
            const tickLower = parseInt(args.tickLower.toString());
            const tickUpper = parseInt(args.tickUpper.toString());

            // 确保 tick 对齐
            if (tickLower % tickSpacing === 0) tickSet.add(tickLower);
            if (tickUpper % tickSpacing === 0) tickSet.add(tickUpper);
          }
        } catch (error) {
          // 忽略解析失败的事件
        }
      }

      this.logger.log(`从事件中提取到 ${tickSet.size} 个唯一的对齐 tick`);

      // 如果没有找到事件，回退到暴力扫描已知范围
      if (tickSet.size === 0) {
        this.logger.log(`未找到事件，回退到暴力扫描已知活跃范围...`);
        return await this.bruteForceKnownRange(poolId, tickSpacing);
      }

      // 验证这些 ticks 是否仍有流动性
      const validTicks: any[] = [];

      for (const tick of Array.from(tickSet)) {
        try {
          const tickInfo = await this.stateViewContract.getTickInfo(poolId, tick);

          if (tickInfo.liquidityGross.gt(0)) {
            validTicks.push({
              tick,
              liquidityGross: tickInfo.liquidityGross,
              liquidityNet: tickInfo.liquidityNet,
              initialized: true
            });

            this.logger.log(`✅ Tick ${tick}: liquidityGross=${tickInfo.liquidityGross.toString()}`);
          }
        } catch (error) {
          // 忽略查询失败的 tick
        }
      }

      // 按 tick 排序
      validTicks.sort((a, b) => a.tick - b.tick);

      this.logger.log(`事件扫描最终找到 ${validTicks.length} 个有效 tick`);
      return validTicks;

    } catch (error) {
      this.logger.error(`事件扫描失败: ${error.message}`);

      // 如果事件扫描完全失败，回退到暴力扫描
      this.logger.log(`事件扫描失败，回退到暴力扫描...`);
      return await this.bruteForceKnownRange(poolId, tickSpacing);
    }
  }

  /**
   * 暴力扫描已知活跃范围（最后的备用方案）
   */
  private async bruteForceKnownRange(poolId: string, tickSpacing: number): Promise<any[]> {
    this.logger.log(`开始暴力扫描已知活跃范围...`);

    // 首先获取当前 tick，围绕它扫描
    let currentTick = -192000; // 从日志中看到的大概位置
    try {
      const slot0 = await this.stateViewContract.getSlot0(poolId);
      currentTick = parseInt(slot0.tick.toString());
      this.logger.log(`获取到当前 tick: ${currentTick}`);
    } catch (error) {
      this.logger.log(`无法获取当前 tick，使用默认值: ${currentTick}`);
    }

    const validTicks: any[] = [];

    // 🔥 全区间扫描：从 -887272 到 887272
    const MIN_TICK = -887272;
    const MAX_TICK = 887272;

    // 确保起始和结束 tick 对齐到 tickSpacing
    const startTick = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
    const endTick = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;

    const totalTicks = Math.floor((endTick - startTick) / tickSpacing) + 1;
    this.logger.log(`全区间扫描范围: ${startTick} 到 ${endTick}, tickSpacing=${tickSpacing}`);
    this.logger.log(`预计扫描 ${totalTicks} 个 tick`);

    let scannedCount = 0;
    let foundCount = 0;

    // 首先检查当前 tick 附近的几个关键点（快速验证）
    const priorityTicks = [
      Math.floor(currentTick / tickSpacing) * tickSpacing, // 当前 tick 对齐
      Math.floor(currentTick / tickSpacing) * tickSpacing - tickSpacing, // 下一个
      Math.floor(currentTick / tickSpacing) * tickSpacing + tickSpacing, // 上一个
    ];

    this.logger.log(`优先检查关键 ticks: [${priorityTicks.join(', ')}]`);

    for (const tick of priorityTicks) {
      try {
        const tickInfo = await this.stateViewContract.getTickInfo(poolId, tick);
        scannedCount++;

        this.logger.log(`检查关键 tick ${tick}: liquidityGross=${tickInfo.liquidityGross.toString()}, liquidityNet=${tickInfo.liquidityNet.toString()}`);

        if (tickInfo.liquidityGross.gt(0)) {
          validTicks.push({
            tick,
            liquidityGross: tickInfo.liquidityGross,
            liquidityNet: tickInfo.liquidityNet,
            initialized: true
          });
          foundCount++;

          this.logger.log(`🎉 找到有流动性的关键 tick ${tick}: liquidityGross=${tickInfo.liquidityGross.toString()}`);
        }
      } catch (error) {
        this.logger.log(`关键 tick ${tick} 查询失败: ${error.message}`);
      }
    }

    this.logger.log(`关键 tick 扫描找到 ${foundCount} 个有效 tick，继续全区间扫描...`);

    // 🔥 全区间扫描：从 -887272 到 887272
    this.logger.log(`🔥 全区间扫描范围: ${startTick} 到 ${endTick}`);

    // 🔥 优化：使用批量扫描替代逐个扫描
    const tickList: number[] = [];
    for (let tick = startTick; tick <= endTick; tick += tickSpacing) {
      tickList.push(tick);
    }

    this.logger.log(`🔥 使用批量扫描，准备扫描 ${tickList.length} 个 tick`);

    // 使用批量获取方法
    const abi = [
      "function ticks(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
    ];
    const rpcUrl = this.configService.get<string>("ethereum.rpcUrl");

    try {
      const batchResults = await this.batchFetchV4Ticks(poolId, tickList, abi, rpcUrl);
      console.log("batchResults", batchResults.length);
      // 处理批量结果
      for (let i = 0; i < tickList.length; i++) {
        const tick = tickList[i];
        const tickInfo = batchResults[i];
        scannedCount++;

        if (tickInfo.liquidityGross.gt(0)) {
          validTicks.push({
            tick,
            liquidityGross: tickInfo.liquidityGross,
            liquidityNet: tickInfo.liquidityNet,
            initialized: true
          });
          foundCount++;

          this.logger.log(`🎯 批量扫描找到 tick ${tick}: liquidityGross=${tickInfo.liquidityGross.toString()}`);
        }

        // 每扫描1000个输出进度
        if (scannedCount % 1000 === 0) {
          const progress = ((scannedCount / tickList.length) * 100).toFixed(1);
          this.logger.log(`📊 结果处理进度: ${scannedCount}/${tickList.length} (${progress}%), 找到 ${foundCount} 个有效 tick`);
        }
      }

      this.logger.log(`🎉 批量扫描完成！总共扫描 ${scannedCount} 个 tick，找到 ${foundCount} 个有效 tick`);
    } catch (error) {
      this.logger.error(`批量扫描失败: ${error.message}`);
    }

    this.logger.log(`暴力扫描完成: 扫描 ${scannedCount} 个 tick，找到 ${foundCount} 个有效`);

    return validTicks.sort((a, b) => a.tick - b.tick);
  }

  /**
   * 从数据库获取已有的 V4 tick 数据
   */
  private async getExistingV4TickData(poolId: string, blockNumber: number): Promise<any[]> {
    try {
      const tickData = await this.tickLiquidityRepository.find({
        where: {
          poolId: poolId,
          version: "v4",
          blockNumber: blockNumber
        },
        order: {
          tick: "ASC"
        }
      });

      return tickData;
    } catch (error) {
      this.logger.error(`获取已有 V4 tick 数据失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 重新计算 V4 tick 数据的价格和代币数量
   */
  private async recalculateV4TickData(
    existingData: any[],
    pool: PoolV4,
    currentTick: number,
    currentSqrtPriceX96: ethers.BigNumber
  ): Promise<any[]> {
    this.logger.log(`开始重新计算 ${existingData.length} 个 tick 的价格和代币数量`);

    const recalculatedData: any[] = [];

    try {
      // 🔥 修复 ETH 地址问题：创建 Token 对象
      const chainId = this.configService.get<number>("ethereum.chainId");

      // 处理 ETH 地址和 USDT decimals 问题
      const token0Address = pool.token0Address === '0x0000000000000000000000000000000000000000'
        ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' // WETH 地址作为替代
        : pool.token0Address;
      const token1Address = pool.token1Address === '0x0000000000000000000000000000000000000000'
        ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' // WETH 地址作为替代
        : pool.token1Address;

      // 🔥 修复 USDT decimals 问题
      const token0Decimals = pool.token0Address === '0x0000000000000000000000000000000000000000' ? 18 : pool.token0Decimals;
      const token1Decimals = pool.token1Address === '0xdAC17F958D2ee523a2206206994597C13D831ec7' ? 6 : pool.token1Decimals; // USDT 是 6 decimals

      const token0 = new Token(
        chainId,
        token0Address,
        token0Decimals,
        pool.token0Symbol || 'ETH',
        pool.token0Symbol || 'ETH'
      );
      const token1 = new Token(
        chainId,
        token1Address,
        token1Decimals,
        pool.token1Symbol || 'USDT',
        pool.token1Symbol || 'USDT'
      );

      this.logger.log(`Token 对象创建: Token0=${token0.symbol}(${token0.decimals}), Token1=${token1.symbol}(${token1.decimals})`);

      // 重新计算每个区间的流动性分布
      for (let i = 0; i < existingData.length - 1; i++) {
        const lowerTickData = existingData[i];
        const upperTickData = existingData[i + 1];

        const lowerTick = lowerTickData.tick;
        const upperTick = upperTickData.tick;

        // 计算这个区间的活跃流动性
        let intervalLiquidity = ethers.BigNumber.from(0);

        for (const tickData of existingData) {
          if (tickData.tick <= lowerTick) {
            intervalLiquidity = intervalLiquidity.add(ethers.BigNumber.from(tickData.liquidityNet));
          }
        }

        if (intervalLiquidity.gt(0)) {
          // 重新计算代币数量
          const { amount0, amount1 } = this.liquidityCalculator.calculateTokenAmountsInRange(
            intervalLiquidity,
            lowerTick,
            upperTick,
            currentTick,
            currentSqrtPriceX96
          );

          // 重新计算价格
          const price = this.uniswapV4Utils.calculateTickPrice(lowerTick, token0, token1);

          recalculatedData.push({
            id: lowerTickData.id,
            tick: lowerTick,
            price: price,
            liquidityGross: lowerTickData.liquidityGross,
            liquidityNet: lowerTickData.liquidityNet,
            token0Amount: amount0.toString(),
            token1Amount: amount1.toString(),
            token0AmountFormatted: this.uniswapV4Utils.formatTokenAmount(amount0, pool.token0Decimals),
            token1AmountFormatted: this.uniswapV4Utils.formatTokenAmount(amount1, pool.token1Decimals),
          });

          this.logger.log(`重新计算区间 [${lowerTick}, ${upperTick}]: 价格=${price}, 流动性=${intervalLiquidity.toString()}, token0=${amount0.toString()}, token1=${amount1.toString()}`);
        }
      }

      this.logger.log(`重新计算完成，生成 ${recalculatedData.length} 个有效区间`);
      return recalculatedData;

    } catch (error) {
      this.logger.error(`重新计算 V4 tick 数据失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 更新数据库中的 V4 tick 数据
   */
  private async updateV4TickData(recalculatedData: any[]): Promise<void> {
    try {
      this.logger.log(`开始更新 ${recalculatedData.length} 条 tick 数据`);

      for (const data of recalculatedData) {
        await this.tickLiquidityRepository.update(
          { id: data.id },
          {
            price: data.price,
            token0Amount: data.token0Amount,
            token1Amount: data.token1Amount,
            token0AmountFormatted: data.token0AmountFormatted,
            token1AmountFormatted: data.token1AmountFormatted,
          }
        );
      }

      this.logger.log(`成功更新 ${recalculatedData.length} 条 tick 数据`);
    } catch (error) {
      this.logger.error(`更新 V4 tick 数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 计算 V4 流动性分布（修复版本）
   */
  private async calculateV4LiquidityDistribution(
    initializedTicks: any[],
    currentTick: number,
    currentSqrtPriceX96: ethers.BigNumber,
    pool: PoolV4
  ): Promise<any[]> {

    this.logger.log(`计算 V4 流动性分布，当前 tick: ${currentTick}`);

    const tickDataArray: any[] = [];

    // 🔥 正确的流动性计算：先计算当前价格点的活跃流动性
    let activeLiquidity = ethers.BigNumber.from(0);

    // 累加所有当前价格左侧（包含）的 tick 的 liquidityNet
    for (const tickData of initializedTicks) {
      if (tickData.tick <= currentTick) {
        activeLiquidity = activeLiquidity.add(tickData.liquidityNet);
      }
    }

    this.logger.log(`当前价格点的活跃流动性: ${activeLiquidity.toString()}`);

    // 计算每个区间的流动性分布
    for (let i = 0; i < initializedTicks.length - 1; i++) {
      const lowerTickData = initializedTicks[i];
      const upperTickData = initializedTicks[i + 1];

      const lowerTick = lowerTickData.tick;
      const upperTick = upperTickData.tick;

      // 计算这个区间的活跃流动性
      let intervalLiquidity = ethers.BigNumber.from(0);

      for (const tickData of initializedTicks) {
        if (tickData.tick <= lowerTick) {
          intervalLiquidity = intervalLiquidity.add(tickData.liquidityNet);
        }
      }

      if (intervalLiquidity.gt(0)) {
        const { amount0, amount1 } = this.liquidityCalculator.calculateTokenAmountsInRange(
          intervalLiquidity,
          lowerTick,
          upperTick,
          currentTick,
          currentSqrtPriceX96
        );

        // 计算价格（使用修复后的 Token 对象）
        const chainId = this.configService.get<number>("ethereum.chainId");

        // 处理 ETH 地址和 USDT decimals 问题
        const token0Address = pool.token0Address === '0x0000000000000000000000000000000000000000'
          ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' // WETH 地址
          : pool.token0Address;
        const token1Address = pool.token1Address === '0x0000000000000000000000000000000000000000'
          ? '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' // WETH 地址
          : pool.token1Address;

        const token0Decimals = pool.token0Address === '0x0000000000000000000000000000000000000000' ? 18 : pool.token0Decimals;
        const token1Decimals = pool.token1Address === '0xdAC17F958D2ee523a2206206994597C13D831ec7' ? 6 : pool.token1Decimals; // USDT 是 6 decimals

        const token0 = new Token(
          chainId,
          token0Address,
          token0Decimals,
          pool.token0Symbol || 'ETH',
          pool.token0Symbol || 'ETH'
        );
        const token1 = new Token(
          chainId,
          token1Address,
          token1Decimals,
          pool.token1Symbol || 'USDT',
          pool.token1Symbol || 'USDT'
        );

        const price = this.uniswapV4Utils.calculateTickPrice(lowerTick, token0, token1);

        tickDataArray.push({
          poolAddress: null,
          poolId: pool.poolId,
          tick: lowerTick,
          price,
          liquidityGross: lowerTickData.liquidityGross.toString(),
          liquidityNet: lowerTickData.liquidityNet.toString(),
          initialized: true,
          token0Amount: amount0.toString(),
          token1Amount: amount1.toString(),
          token0AmountFormatted: this.uniswapV4Utils.formatTokenAmount(amount0, pool.token0Decimals),
          token1AmountFormatted: this.uniswapV4Utils.formatTokenAmount(amount1, pool.token1Decimals),
          blockNumber: await this.stateViewContract.provider.getBlockNumber(),
          blockTimestamp: new Date(),
          version: "v4"
        });

        this.logger.log(`区间 [${lowerTick}, ${upperTick}]: 流动性=${intervalLiquidity.toString()}, token0=${amount0.toString()}, token1=${amount1.toString()}`);
      }
    }

    return tickDataArray;
  }
}
