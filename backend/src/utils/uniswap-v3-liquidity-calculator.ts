import { TickMath, SqrtPriceMath } from "@uniswap/v3-sdk";
import { BigNumber, ethers } from "ethers";

interface Tick {
  tick: number;
  liquidityNet: BigNumber;
  liquidityGross: BigNumber;
  initialized: boolean;
}

interface TokenAmounts {
  amount0: BigNumber;
  amount1: BigNumber;
}

interface CalculationResult extends TokenAmounts {
  amount0Formatted: string;
  amount1Formatted: string;
  ticksProcessed: number;
}

interface Pool {
  slot0(): Promise<
    [BigNumber, number, number, number, number, number, boolean]
  >;
  liquidity(): Promise<BigNumber>;
  tickSpacing(): Promise<number>;
  ticks(tick: number): Promise<{
    liquidityGross: BigNumber;
    liquidityNet: BigNumber;
    feeGrowthOutside0X128: BigNumber;
    feeGrowthOutside1X128: BigNumber;
    tickCumulativeOutside: BigNumber;
    secondsPerLiquidityOutsideX128: BigNumber;
    secondsOutside: number;
    initialized: boolean;
  }>;
}

export class UniswapV3LiquidityCalculator {
  private readonly Q96: BigNumber;
  private readonly MIN_TICK: number = -887272;
  private readonly MAX_TICK: number = 887272;

  constructor() {
    this.Q96 = BigNumber.from(2).pow(96);
  }

  /**
   * Calculate sqrt price at tick using Uniswap V3's exact formula
   */
  public getSqrtRatioAtTick(tick: number): BigNumber {
    const absTick = Math.abs(tick);

    let ratio =
      (absTick & 0x1) !== 0
        ? BigNumber.from("0xfffcb933bd6fad37aa2d162d1a594001")
        : BigNumber.from("0x100000000000000000000000000000000");

    if (absTick & 0x2)
      ratio = ratio
        .mul("0xfff97272373d413259a46990580e213a")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x4)
      ratio = ratio
        .mul("0xfff2e50f5f656932ef12357cf3c7fdcc")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x8)
      ratio = ratio
        .mul("0xffe5caca7e10e4e61c3624eaa0941cd0")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x10)
      ratio = ratio
        .mul("0xffcb9843d60f6159c9db58835c926644")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x20)
      ratio = ratio
        .mul("0xff973b41fa98c081472e6896dfb254c0")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x40)
      ratio = ratio
        .mul("0xff2ea16466c96a3843ec78b326b52861")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x80)
      ratio = ratio
        .mul("0xfe5dee046a99a2a811c461f1969c3053")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x100)
      ratio = ratio
        .mul("0xfcbe86c7900a88aedcffc83b479aa3a4")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x200)
      ratio = ratio
        .mul("0xf987a7253ac413176f2b074cf7815e54")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x400)
      ratio = ratio
        .mul("0xf3392b0822b70005940c7a398e4b70f3")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x800)
      ratio = ratio
        .mul("0xe7159475a2c29b7443b29c7fa6e889d9")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x1000)
      ratio = ratio
        .mul("0xd097f3bdfd2022b8845ad8f792aa5825")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x2000)
      ratio = ratio
        .mul("0xa9f746462d870fdf8a65dc1f90e061e5")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x4000)
      ratio = ratio
        .mul("0x70d869a156d2a1b890bb3df62baf32f7")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x8000)
      ratio = ratio
        .mul("0x31be135f97d08fd981231505542fcfa6")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x10000)
      ratio = ratio
        .mul("0x9aa508b5b7a84e1c677de54f3e99bc9")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x20000)
      ratio = ratio
        .mul("0x5d6af8dedb81196699c329225ee604")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x40000)
      ratio = ratio
        .mul("0x2216e584f5fa1ea926041bedfe98")
        .div(BigNumber.from(2).pow(128));
    if (absTick & 0x80000)
      ratio = ratio
        .mul("0x48a170391f7dc42444e8fa2")
        .div(BigNumber.from(2).pow(128));

    if (tick > 0) ratio = ethers.constants.MaxUint256.div(ratio);

    return ratio.shr(32);
  }

  /**
   * Calculate amount of token0 for given liquidity and price range
   */
  public getAmount0ForLiquidity(
    sqrtRatioAX96: BigNumber,
    sqrtRatioBX96: BigNumber,
    liquidity: BigNumber,
  ): BigNumber {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    // 使用 Uniswap V3 SDK 官方方法，参数需转为 JSBI
    const JSBI = require('jsbi');
    const sqrtA = JSBI.BigInt(sqrtRatioAX96.toString());
    const sqrtB = JSBI.BigInt(sqrtRatioBX96.toString());
    const liq = JSBI.BigInt(liquidity.toString());
    const result = SqrtPriceMath.getAmount0Delta(sqrtA, sqrtB, liq, false);
    return BigNumber.from(result.toString());
  }

  /**
   * Calculate amount of token1 for given liquidity and price range
   */
  public getAmount1ForLiquidity(
    sqrtRatioAX96: BigNumber,
    sqrtRatioBX96: BigNumber,
    liquidity: BigNumber,
  ): BigNumber {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    // 使用 Uniswap V3 SDK 官方方法，参数需转为 JSBI
    const JSBI = require('jsbi');
    const sqrtA = JSBI.BigInt(sqrtRatioAX96.toString());
    const sqrtB = JSBI.BigInt(sqrtRatioBX96.toString());
    const liq = JSBI.BigInt(liquidity.toString());
    const result = SqrtPriceMath.getAmount1Delta(sqrtA, sqrtB, liq, false);
    return BigNumber.from(result.toString());
  }

  /**
   * Calculate token amounts for a specific tick range
   */
  calculateTokenAmountsInRange(
    liquidity: ethers.BigNumber,
    tickLower: number,
    tickUpper: number,
    currentTick: number,
    currentSqrtPriceX96: ethers.BigNumber,
  ): { amount0: ethers.BigNumber; amount1: ethers.BigNumber } {
    try {
      const sqrtRatioLowerX96 = TickMath.getSqrtRatioAtTick(tickLower);
      const sqrtRatioUpperX96 = TickMath.getSqrtRatioAtTick(tickUpper);

      // 转换为BigNumber
      const sqrtRatioLowerBN = ethers.BigNumber.from(
        sqrtRatioLowerX96.toString(),
      );
      const sqrtRatioUpperBN = ethers.BigNumber.from(
        sqrtRatioUpperX96.toString(),
      );
      const currentSqrtPriceBN = ethers.BigNumber.from(
        currentSqrtPriceX96.toString(),
      );

      let amount0 = ethers.BigNumber.from(0);
      let amount1 = ethers.BigNumber.from(0);

      if (currentTick < tickLower) {
        // 当前价格在范围下方，全部是token0
        amount0 = this.getAmount0ForLiquidity(
          sqrtRatioLowerBN,
          sqrtRatioUpperBN,
          liquidity,
        );
      } else if (currentTick < tickUpper) {
        // 当前价格在范围内
        amount0 = this.getAmount0ForLiquidity(
          currentSqrtPriceBN,
          sqrtRatioUpperBN,
          liquidity,
        );
        amount1 = this.getAmount1ForLiquidity(
          sqrtRatioLowerBN,
          currentSqrtPriceBN,
          liquidity,
        );
      } else {
        // 当前价格在范围上方，全部是token1
        amount1 = this.getAmount1ForLiquidity(
          sqrtRatioLowerBN,
          sqrtRatioUpperBN,
          liquidity,
        );
      }

      return { amount0, amount1 };
    } catch (error) {
      console.log(currentTick)
      console.log(tickLower)
      console.log(tickUpper)
      throw new Error(`Failed to calculate token amounts: ${error.message}`);
    }
  }


  /**
   * Calculate total token amounts using liquidityNet
   */
  public async calculateTotalTokenAmounts(
    pool: Pool,
    token0Decimals: number = 18,
    token1Decimals: number = 18,
    scanRange: number = 100000,
  ): Promise<CalculationResult> {
    // Get current pool state
    const [sqrtPriceX96, currentTick] = await pool.slot0();
    const tickSpacing = await pool.tickSpacing();
    const minTick = Math.ceil(this.MIN_TICK / tickSpacing) * tickSpacing;
    const maxTick = Math.floor(this.MAX_TICK / tickSpacing) * tickSpacing;
    const tickList: number[] = [];
    for (let t = minTick; t <= maxTick; t += tickSpacing) {
      tickList.push(t);
    }
    const abi = [
      "function ticks(int24) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
    ];
    // 获取 rpcUrl
    let rpcUrl = "";
    if ((pool as any).provider && (pool as any).provider.connection && (pool as any).provider.connection.url) {
      rpcUrl = (pool as any).provider.connection.url;
    } else {
      rpcUrl = process.env.ETH_RPC_URL || "";
    }
    // 兼容 pool 传入方式
    const batchResults = await batchFetchTicks(
      (pool as any).address || "",
      tickList,
      abi,
      rpcUrl,
    );

    // 收集所有初始化的 ticks
    const ticks: Tick[] = [];
    for (let i = 0; i < tickList.length; i++) {
      const tickData = batchResults[i];
      if (tickData && tickData.initialized) {
        ticks.push({
          tick: tickList[i],
          liquidityNet: tickData.liquidityNet,
          liquidityGross: tickData.liquidityGross,
          initialized: true,
        });
      }
    }
    ticks.sort((a, b) => a.tick - b.tick);
    console.log(`Found ${ticks.length} initialized ticks`);

    // 计算 token 数量
    let totalAmount0 = BigNumber.from(0);
    let totalAmount1 = BigNumber.from(0);
    let activeLiquidity = BigNumber.from(0);

    for (let i = 0; i < ticks.length; i++) {
      if (i > 0 && activeLiquidity.gt(0)) {
        const lowerTick = ticks[i - 1].tick;
        const upperTick = ticks[i].tick;
        if (lowerTick < upperTick) {
          const { amount0, amount1 } = this.calculateTokenAmountsInRange(
            activeLiquidity,
            lowerTick,
            upperTick,
            currentTick,
            sqrtPriceX96,
          );
          totalAmount0 = totalAmount0.add(amount0);
          totalAmount1 = totalAmount1.add(amount1);
        }
      }
      activeLiquidity = activeLiquidity.add(ticks[i].liquidityNet);
      if (activeLiquidity.lt(0)) {
        console.error(`Negative liquidity at tick ${ticks[i].tick}`);
        activeLiquidity = BigNumber.from(0);
      }
    }
    if (
      ticks.length > 0 &&
      currentTick > ticks[ticks.length - 1].tick &&
      activeLiquidity.gt(0)
    ) {
      const lowerTick = ticks[ticks.length - 1].tick;
      const upperTick = currentTick + tickSpacing;
      const { amount0, amount1 } = this.calculateTokenAmountsInRange(
        activeLiquidity,
        lowerTick,
        upperTick,
        currentTick,
        sqrtPriceX96,
      );
      totalAmount0 = totalAmount0.add(amount0);
      totalAmount1 = totalAmount1.add(amount1);
    }
    return {
      amount0: totalAmount0,
      amount1: totalAmount1,
      amount0Formatted: ethers.utils.formatUnits(totalAmount0, token0Decimals),
      amount1Formatted: ethers.utils.formatUnits(totalAmount1, token1Decimals),
      ticksProcessed: ticks.length,
    };
  }

  /**
   * Find active liquidity range by scanning outward from current tick
   */
  public async findActiveLiquidityRange(
    pool: Pool,
    currentTick: number,
    tickSpacing: number,
  ): Promise<{ lowerBound: number; upperBound: number }> {
    const currentLiquidity = await pool.liquidity();

    let lowerBound = currentTick;
    let upperBound = currentTick;

    // Scan downward
    let tempLiquidity = currentLiquidity;
    let tick = currentTick - tickSpacing;

    while (tempLiquidity.gt(0) && tick >= this.MIN_TICK) {
      try {
        const tickData = await pool.ticks(tick);
        if (tickData.initialized) {
          tempLiquidity = tempLiquidity.sub(tickData.liquidityNet);
          if (tempLiquidity.gt(0)) {
            lowerBound = tick;
          }
        }
      } catch {
        // Ignore
      }
      tick -= tickSpacing;
    }

    // Scan upward
    tempLiquidity = currentLiquidity;
    tick = currentTick + tickSpacing;

    while (tempLiquidity.gt(0) && tick <= this.MAX_TICK) {
      try {
        const tickData = await pool.ticks(tick);
        if (tickData.initialized) {
          tempLiquidity = tempLiquidity.add(tickData.liquidityNet);
          if (tempLiquidity.gt(0)) {
            upperBound = tick;
          }
        }
      } catch {
        // Ignore
      }
      tick += tickSpacing;
    }

    return { lowerBound, upperBound };
  }
}

export async function batchFetchTicks(
  poolAddress: string,
  tickList: number[],
  abi: any,
  rpcUrl: string,
): Promise<any[]> {
  const ethersProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const poolContract = new ethers.Contract(poolAddress, abi, ethersProvider);

  const BATCH_SIZE = 50;
  const results: any[] = [];

  for (let i = 0; i < tickList.length; i += BATCH_SIZE) {
    const batch = tickList.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(tick =>
      poolContract.ticks(tick).catch(() => null)
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(result => result !== null));
  }

  return results;
}