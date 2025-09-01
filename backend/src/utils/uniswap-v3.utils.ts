import { ethers } from "ethers";
import { Token } from "@uniswap/sdk-core";
import { tickToPrice, TickMath } from "@uniswap/v3-sdk";

// Uniswap V3 Factory ABI - 只包含我们需要的方法
const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

// Uniswap V3 Pool ABI - 只包含我们需要的方法
const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
  "function tickBitmap(int16 wordPosition) external view returns (uint256)",
  "function tickSpacing() external view returns (int24)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

// ERC20 ABI - 用于获取token信息
const ERC20_ABI = [
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function balanceOf(address account) external view returns (uint256)",
];

export class UniswapV3Utils {
  private provider: ethers.providers.JsonRpcProvider;
  private factoryAddress: string;

  constructor(rpcUrl: string, factoryAddress: string) {
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.factoryAddress = factoryAddress;
  }

  /**
   * 根据token地址和费率计算池子地址
   * @param token0Address token0地址
   * @param token1Address token1地址
   * @param fee 费率 (500, 3000, 10000)
   * @returns 池子地址
   */
  async getPoolAddress(
    token0Address: string,
    token1Address: string,
    fee: number,
  ): Promise<string> {
    try {
      const factory = new ethers.Contract(
        this.factoryAddress,
        FACTORY_ABI,
        this.provider,
      );

      // 确保token地址按字典序排序
      const [tokenA, tokenB] = [token0Address, token1Address].sort();

      const poolAddress = await factory.getPool(tokenA, tokenB, fee);

      if (poolAddress === ethers.constants.AddressZero) {
        throw new Error("Pool does not exist");
      }

      return poolAddress;
    } catch (error) {
      throw new Error(`Failed to get pool address: ${error.message}`);
    }
  }

  /**
   * 获取池子基本信息
   * @param poolAddress 池子地址
   * @returns 池子信息
   */
  async getPoolInfo(poolAddress: string) {
    try {
      const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);

      const [sqrtPriceX96, currentTick, , , , ,] = await pool.slot0();
      const tickSpacing = await pool.tickSpacing();
      const totalLiquidity = await pool.liquidity();
      const token0Address = await pool.token0();
      const token1Address = await pool.token1();

      return {
        poolAddress,
        currentTick: typeof currentTick === 'number' ? currentTick : currentTick.toNumber(),
        tickSpacing: typeof tickSpacing === 'number' ? tickSpacing : tickSpacing.toNumber(),
        totalLiquidity: totalLiquidity.toString(),
        currentSqrtPriceX96: sqrtPriceX96.toString(),
        token0Address,
        token1Address,
      };
    } catch (error) {
      throw new Error(`Failed to get pool info: ${error.message}`);
    }
  }

  /**
   * 获取代币信息
   * @param tokenAddress 代币地址
   * @returns 代币信息
   */
  async getTokenInfo(tokenAddress: string) {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.provider,
      );

      const [decimals, symbol, name] = await Promise.all([
        tokenContract.decimals(),
        tokenContract.symbol(),
        tokenContract.name(),
      ]);

      return {
        address: tokenAddress,
        decimals,
        symbol,
        name,
      };
    } catch (error) {
      throw new Error(`Failed to get token info: ${error.message}`);
    }
  }

  /**
   * 计算tick对应的价格
   * @param tick tick值
   * @param token0 代币0
   * @param token1 代币1
   * @returns 价格
   */
  calculateTickPrice(tick: number, token0: Token, token1: Token): string {
    try {
      const price = tickToPrice(token0, token1, tick);
      return price.toFixed(18);
    } catch (error) {
      throw new Error(`Failed to calculate tick price: ${error.message}`);
    }
  }

  /**
   * 计算特定范围内的代币数量
   * @param liquidity 流动性
   * @param tickLower 下界tick
   * @param tickUpper 上界tick
   * @param currentTick 当前tick
   * @param currentSqrtPriceX96 当前价格
   * @returns 代币数量
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
      throw new Error(`Failed to calculate token amounts: ${error.message}`);
    }
  }

  /**
   * 计算Amount0
   */
  private getAmount0ForLiquidity(
    sqrtRatioAX96: ethers.BigNumber,
    sqrtRatioBX96: ethers.BigNumber,
    liquidity: ethers.BigNumber,
  ): ethers.BigNumber {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    return liquidity
      .mul(sqrtRatioBX96.sub(sqrtRatioAX96))
      .mul(ethers.BigNumber.from(2).pow(96))
      .div(sqrtRatioBX96)
      .div(sqrtRatioAX96);
  }

  /**
   * 计算Amount1
   */
  private getAmount1ForLiquidity(
    sqrtRatioAX96: ethers.BigNumber,
    sqrtRatioBX96: ethers.BigNumber,
    liquidity: ethers.BigNumber,
  ): ethers.BigNumber {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    return liquidity
      .mul(sqrtRatioBX96.sub(sqrtRatioAX96))
      .div(ethers.BigNumber.from(2).pow(96));
  }

  /**
   * 格式化流动性数值
   */
  formatLiquidity(liquidity: ethers.BigNumber): string {
    return ethers.utils.formatUnits(liquidity, 0);
  }

  /**
   * 格式化token数量
   */
  formatTokenAmount(amount: ethers.BigNumber, decimals: number): string {
    return ethers.utils.formatUnits(amount, decimals);
  }
}
