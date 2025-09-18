import { ethers } from "ethers";
import { Token } from "@uniswap/sdk-core";
import { tickToPrice, TickMath } from "@uniswap/v3-sdk";
import { keccak256, defaultAbiCoder } from "ethers/lib/utils";

// Uniswap V4 PoolManager ABI - 只包含我们需要的方法（移除 calldata 关键字）
const POOL_MANAGER_ABI = [
  "function getSlot0(bytes32 id) external view returns (uint160 sqrtPriceX96, int24 tick, uint8 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 id) external view returns (uint128 liquidity)",
  "function getPosition(bytes32 id, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) external view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function take(address currency, address to, uint256 amount) external",
  "function settle(address currency) external payable returns (uint256 paid)",
  "function clear(address currency, uint256 amount) external",
  "function sync(address currency) external",
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
];

// ERC20 ABI - 用于获取token信息
const ERC20_ABI = [
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function balanceOf(address account) external view returns (uint256)",
];

// PoolKey 结构定义
export interface PoolKey {
  currency0: string;  // token0 地址
  currency1: string;  // token1 地址
  fee: number;        // 费率
  tickSpacing: number; // tick间距
  hooks: string;      // hooks合约地址
}

export interface PoolInfo {
  poolId: string;
  poolKey: PoolKey;
  currentTick: number;
  tickSpacing: number;
  totalLiquidity: string;
  currentSqrtPriceX96: string;
  protocolFee: number;
  lpFee: number;
}

export class UniswapV4Utils {
  private provider: ethers.providers.JsonRpcProvider;
  private poolManagerAddress: string;

  constructor(rpcUrl: string, poolManagerAddress: string) {
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.poolManagerAddress = poolManagerAddress;
  }

  /**
   * 根据 PoolKey 计算 PoolId
   * @param poolKey PoolKey 结构
   * @returns PoolId (bytes32)
   */
  calculatePoolId(poolKey: PoolKey): string {
    try {
      // 确保 token 地址按字典序排序
      const [currency0, currency1] = [poolKey.currency0, poolKey.currency1].sort();

      // 按照 V4 的编码方式计算 PoolId
      const encodedData = defaultAbiCoder.encode(
        ["address", "address", "uint24", "int24", "address"],
        [currency0, currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
      );

      return keccak256(encodedData);
    } catch (error) {
      throw new Error(`Failed to calculate pool ID: ${error.message}`);
    }
  }

  /**
   * 创建 PoolKey
   * @param token0Address token0地址
   * @param token1Address token1地址
   * @param fee 费率
   * @param tickSpacing tick间距
   * @param hooksAddress hooks合约地址
   * @returns PoolKey
   */
  createPoolKey(
    token0Address: string,
    token1Address: string,
    fee: number,
    tickSpacing: number,
    hooksAddress: string = ethers.constants.AddressZero
  ): PoolKey {
    // 确保token地址按字典序排序
    const [currency0, currency1] = [token0Address, token1Address].sort();

    return {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks: hooksAddress
    };
  }

  /**
   * 获取池子基本信息
   * @param poolKey PoolKey 或 PoolId
   * @returns 池子信息
   */
  async getPoolInfo(poolKeyOrId: PoolKey | string): Promise<PoolInfo> {
    try {
      const poolManager = new ethers.Contract(
        this.poolManagerAddress,
        POOL_MANAGER_ABI,
        this.provider
      );

      let poolId: string;
      let poolKey: PoolKey;

      if (typeof poolKeyOrId === 'string') {
        // 如果传入的是 PoolId
        poolId = poolKeyOrId;
        // 注意：从 PoolId 反推 PoolKey 在实际应用中需要额外的存储或索引
        throw new Error("Cannot derive PoolKey from PoolId alone. Please provide PoolKey.");
      } else {
        // 如果传入的是 PoolKey
        poolKey = poolKeyOrId;
        poolId = this.calculatePoolId(poolKey);
      }

      // 获取池子状态
      const [sqrtPriceX96, currentTick, protocolFee, lpFee] = await poolManager.getSlot0(poolId);
      const totalLiquidity = await poolManager.getLiquidity(poolId);

      return {
        poolId,
        poolKey,
        currentTick: typeof currentTick === 'number' ? currentTick : currentTick.toNumber(),
        tickSpacing: poolKey.tickSpacing,
        totalLiquidity: totalLiquidity.toString(),
        currentSqrtPriceX96: sqrtPriceX96.toString(),
        protocolFee: typeof protocolFee === 'number' ? protocolFee : protocolFee.toNumber(),
        lpFee: typeof lpFee === 'number' ? lpFee : lpFee.toNumber(),
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
      // 使用更简单的价格计算方法
      const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
      
      // 计算价格 = (sqrtPriceX96 / 2^96)^2
      const Q96 = ethers.BigNumber.from(2).pow(96);
      const price = sqrtPriceX96.mul(sqrtPriceX96).div(Q96).div(Q96);
      
      // 根据 token decimals 调整
      const decimalAdjustment = ethers.BigNumber.from(10).pow(token1.decimals - token0.decimals);
      const adjustedPrice = price.mul(decimalAdjustment);
      
      // 转换为可读格式
      const formattedPrice = ethers.utils.formatUnits(adjustedPrice, token1.decimals);
      
      // 如果价格为0或无效，使用备用计算方法
      if (formattedPrice === '0.0' || isNaN(parseFloat(formattedPrice))) {
        // 备用方法：使用 tick 直接计算
        const priceRatio = Math.pow(1.0001, tick);
        const adjustedRatio = priceRatio * Math.pow(10, token1.decimals - token0.decimals);
        return adjustedRatio.toFixed(18);
      }
      
      return formattedPrice;
    } catch (error) {
      // 如果所有方法都失败，使用最基本的计算
      try {
        const priceRatio = Math.pow(1.0001, tick);
        const adjustedRatio = priceRatio * Math.pow(10, token1.decimals - token0.decimals);
        return adjustedRatio.toFixed(18);
      } catch (fallbackError) {
        console.warn(`Failed to calculate tick price for tick ${tick}: ${error.message}, fallback also failed: ${fallbackError.message}`);
        return "0";
      }
    }
  }

  /**
   * 格式化代币数量
   * @param amount 原始数量
   * @param decimals 小数位数
   * @returns 格式化后的数量字符串
   */
  formatTokenAmount(amount: ethers.BigNumber, decimals: number): string {
    try {
      return ethers.utils.formatUnits(amount, decimals);
    } catch (error) {
      throw new Error(`Failed to format token amount: ${error.message}`);
    }
  }

  /**
   * 计算特定范围内的代币数量 (与V3相同的逻辑)
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
      const sqrtRatioLowerBN = ethers.BigNumber.from(sqrtRatioLowerX96.toString());
      const sqrtRatioUpperBN = ethers.BigNumber.from(sqrtRatioUpperX96.toString());

      let amount0 = ethers.BigNumber.from(0);
      let amount1 = ethers.BigNumber.from(0);

      if (currentTick < tickLower) {
        // 当前价格低于范围，只有token0
        amount0 = this.getAmount0ForLiquidity(sqrtRatioLowerBN, sqrtRatioUpperBN, liquidity);
      } else if (currentTick >= tickUpper) {
        // 当前价格高于范围，只有token1
        amount1 = this.getAmount1ForLiquidity(sqrtRatioLowerBN, sqrtRatioUpperBN, liquidity);
      } else {
        // 当前价格在范围内，两种token都有
        amount0 = this.getAmount0ForLiquidity(currentSqrtPriceX96, sqrtRatioUpperBN, liquidity);
        amount1 = this.getAmount1ForLiquidity(sqrtRatioLowerBN, currentSqrtPriceX96, liquidity);
      }

      return { amount0, amount1 };
    } catch (error) {
      throw new Error(`Failed to calculate token amounts: ${error.message}`);
    }
  }

  /**
   * 获取池子的交易事件 (用于收益计算)
   */
  async getPoolSwapEvents(
    poolId: string,
    fromBlock: number,
    toBlock: number
  ): Promise<ethers.Event[]> {
    try {
      const poolManager = new ethers.Contract(
        this.poolManagerAddress,
        POOL_MANAGER_ABI,
        this.provider
      );

      const filter = poolManager.filters.Swap(poolId);
      const events = await poolManager.queryFilter(filter, fromBlock, toBlock);

      return events;
    } catch (error) {
      throw new Error(`Failed to get swap events: ${error.message}`);
    }
  }

  /**
   * 计算amount0 (与V3相同的逻辑)
   */
  private getAmount0ForLiquidity(
    sqrtRatioAX96: ethers.BigNumber,
    sqrtRatioBX96: ethers.BigNumber,
    liquidity: ethers.BigNumber
  ): ethers.BigNumber {
    const Q96 = ethers.BigNumber.from(2).pow(96);

    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    return liquidity
      .mul(Q96)
      .mul(sqrtRatioBX96.sub(sqrtRatioAX96))
      .div(sqrtRatioBX96)
      .div(sqrtRatioAX96);
  }

  /**
   * 计算amount1 (与V3相同的逻辑)
   */
  private getAmount1ForLiquidity(
    sqrtRatioAX96: ethers.BigNumber,
    sqrtRatioBX96: ethers.BigNumber,
    liquidity: ethers.BigNumber
  ): ethers.BigNumber {
    if (sqrtRatioAX96.gt(sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    return liquidity.mul(sqrtRatioBX96.sub(sqrtRatioAX96)).div(ethers.BigNumber.from(2).pow(96));
  }
}