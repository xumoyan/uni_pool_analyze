import { expect } from "chai";
import { BigNumber, ethers } from "ethers";
import { UniswapV3LiquidityCalculator } from "../src/utils/uniswap-v3-liquidity-calculator";

// Mock Pool implementation for testing
class MockPool {
  private ticksData: Map<number, any> = new Map();
  private _slot0: [BigNumber, number, number, number, number, number, boolean];
  private _liquidity: BigNumber;
  private _tickSpacing: number;

  constructor(
    currentSqrtPriceX96: BigNumber,
    currentTick: number,
    liquidity: BigNumber,
    tickSpacing: number,
  ) {
    this._slot0 = [currentSqrtPriceX96, currentTick, 0, 0, 0, 0, true];
    this._liquidity = liquidity;
    this._tickSpacing = tickSpacing;
  }

  async slot0() {
    return this._slot0;
  }

  async liquidity() {
    return this._liquidity;
  }

  async tickSpacing() {
    return this._tickSpacing;
  }

  public async ticks(tick: number) {
    const data = this.ticksData.get(tick);
    if (!data) {
      return {
        liquidityGross: BigNumber.from(0),
        liquidityNet: BigNumber.from(0),
        feeGrowthOutside0X128: BigNumber.from(0),
        feeGrowthOutside1X128: BigNumber.from(0),
        tickCumulativeOutside: BigNumber.from(0),
        secondsPerLiquidityOutsideX128: BigNumber.from(0),
        secondsOutside: 0,
        initialized: false,
      };
    }
    return data;
  }

  setTick(tick: number, liquidityNet: BigNumber, liquidityGross: BigNumber) {
    this.ticksData.set(tick, {
      liquidityGross,
      liquidityNet,
      feeGrowthOutside0X128: BigNumber.from(0),
      feeGrowthOutside1X128: BigNumber.from(0),
      tickCumulativeOutside: BigNumber.from(0),
      secondsPerLiquidityOutsideX128: BigNumber.from(0),
      secondsOutside: 0,
      initialized: true,
    });
  }

  setCurrentTick(tick: number) {
    this._slot0[1] = tick;
  }

  setCurrentSqrtPrice(sqrtPriceX96: BigNumber) {
    this._slot0[0] = sqrtPriceX96;
  }
}

describe("UniswapV3LiquidityCalculator", () => {
  describe("自定义 ticks 数据 amount 计算调试", () => {
    it("should calculate token amounts for user provided tick data", () => {
      const calculator = new UniswapV3LiquidityCalculator();
      // 用户提供的 tick 数据
      const tick = 69760;
      const liquidityGross = BigNumber.from("222927446473");
      const liquidityNet = BigNumber.from("222927446473");
      // 假设当前池子状态
      const tickLower = tick - 10; // tickSpacing 取 60
      const tickUpper = tick + 10;
      const currentTick = 69987;
      const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);
      const liquidity = liquidityGross;
      // 计算 token amount
      const { amount0, amount1 } = calculator.calculateTokenAmountsInRange(
        liquidity,
        tickLower,
        tickUpper,
        currentTick,
        currentSqrtPrice,
      );
      // 输出结果，方便断点调试
      console.log("tick:", tick);
      console.log("liquidityGross:", liquidityGross.toString());
      console.log("liquidityNet:", liquidityNet.toString());
      console.log("amount0:", amount0.toString());
      console.log("amount1:", amount1.toString());

      console.log("amount0 (formatted):", ethers.utils.formatUnits(amount0, 6));
      console.log("amount1 (formatted):", ethers.utils.formatUnits(amount1, 8));

      // 断言结果为 BigNumber 类型
      expect(amount0).to.not.be.undefined;
      expect(amount1).to.not.be.undefined;
    });
  });
  let calculator: UniswapV3LiquidityCalculator;

  beforeEach(() => {
    calculator = new UniswapV3LiquidityCalculator();
  });

  describe("getSqrtRatioAtTick", () => {
    it("should calculate correct sqrt price for tick 0", () => {
      const sqrtPrice = calculator.getSqrtRatioAtTick(0);
      const expected = BigNumber.from(2).pow(96);
      expect(sqrtPrice.toString()).to.equal(expected.toString());
    });

    it("should calculate correct sqrt price for positive ticks", () => {
      const sqrtPrice = calculator.getSqrtRatioAtTick(1);
      // Price at tick 1 should be 1.0001
      // sqrt(1.0001) * 2^96
      expect(sqrtPrice.gt(BigNumber.from(2).pow(96))).to.be.true;
    });

    it("should calculate correct sqrt price for negative ticks", () => {
      const sqrtPrice = calculator.getSqrtRatioAtTick(-1);
      // Price at tick -1 should be 1/1.0001
      // sqrt(1/1.0001) * 2^96
      expect(sqrtPrice.lt(BigNumber.from(2).pow(96))).to.be.true;
    });

    it("should handle extreme ticks", () => {
      const minSqrtPrice = calculator.getSqrtRatioAtTick(-887272);
      const maxSqrtPrice = calculator.getSqrtRatioAtTick(887272);

      expect(minSqrtPrice.gt(0)).to.be.true;
      expect(maxSqrtPrice.gt(minSqrtPrice)).to.be.true;
    });
  });

  describe("getAmount0ForLiquidity", () => {
    it("should calculate correct token0 amount", () => {
      const sqrtPriceA = calculator.getSqrtRatioAtTick(-100);
      const sqrtPriceB = calculator.getSqrtRatioAtTick(100);
      const liquidity = ethers.utils.parseEther("1");

      const amount0 = calculator.getAmount0ForLiquidity(
        sqrtPriceA,
        sqrtPriceB,
        liquidity,
      );

      expect(amount0.gt(0)).to.be.true;
    });

    it("should handle reversed price inputs", () => {
      const sqrtPriceA = calculator.getSqrtRatioAtTick(100);
      const sqrtPriceB = calculator.getSqrtRatioAtTick(-100);
      const liquidity = ethers.utils.parseEther("1");

      const amount0 = calculator.getAmount0ForLiquidity(
        sqrtPriceA,
        sqrtPriceB,
        liquidity,
      );
      const amount0Reversed = calculator.getAmount0ForLiquidity(
        sqrtPriceB,
        sqrtPriceA,
        liquidity,
      );

      expect(amount0.toString()).to.equal(amount0Reversed.toString());
    });
  });

  describe("getAmount1ForLiquidity", () => {
    it("should calculate correct token1 amount", () => {
      const sqrtPriceA = calculator.getSqrtRatioAtTick(-100);
      const sqrtPriceB = calculator.getSqrtRatioAtTick(100);
      const liquidity = ethers.utils.parseEther("1");

      const amount1 = calculator.getAmount1ForLiquidity(
        sqrtPriceA,
        sqrtPriceB,
        liquidity,
      );

      expect(amount1.gt(0)).to.be.true;
    });
  });

  describe("calculateTokenAmountsInRange", () => {
    const liquidity = ethers.utils.parseEther("1000");

    it("should return only token0 when price is below range", () => {
      const currentTick = -200;
      const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);

      const { amount0, amount1 } = calculator.calculateTokenAmountsInRange(
        liquidity,
        -100, // tickLower
        100, // tickUpper
        currentTick,
        currentSqrtPrice,
      );

      expect(amount0.gt(0)).to.be.true;
      expect(amount1.toString()).to.equal("0");
    });

    it("should return only token1 when price is above range", () => {
      const currentTick = 200;
      const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);

      const { amount0, amount1 } = calculator.calculateTokenAmountsInRange(
        liquidity,
        -100, // tickLower
        100, // tickUpper
        currentTick,
        currentSqrtPrice,
      );

      expect(amount0.toString()).to.equal("0");
      expect(amount1.gt(0)).to.be.true;
    });

    it("should return both tokens when price is within range", () => {
      const currentTick = 0;
      const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);

      const { amount0, amount1 } = calculator.calculateTokenAmountsInRange(
        liquidity,
        -100, // tickLower
        100, // tickUpper
        currentTick,
        currentSqrtPrice,
      );

      expect(amount0.gt(0)).to.be.true;
      expect(amount1.gt(0)).to.be.true;
    });
  });

  // describe("calculateTotalTokenAmounts", () => {
  //   it("should calculate total amounts for simple pool", async () => {
  //     const currentTick = 0;
  //     const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);
  //     const tickSpacing = 60;
  //     const poolLiquidity = ethers.utils.parseEther("1000");

  //     const mockPool = new MockPool(
  //       currentSqrtPrice,
  //       currentTick,
  //       poolLiquidity,
  //       tickSpacing,
  //     );

  //     // Set up a simple liquidity distribution
  //     // Position 1: [-120, 120] with liquidity 1000
  //     mockPool.setTick(
  //       -120,
  //       ethers.utils.parseEther("1000"),
  //       ethers.utils.parseEther("1000"),
  //     );
  //     mockPool.setTick(
  //       120,
  //       ethers.utils.parseEther("-1000"),
  //       ethers.utils.parseEther("1000"),
  //     );

  //     const result = await calculator.calculateTotalTokenAmounts(
  //       mockPool,
  //       18,
  //       18,
  //       1000,
  //     );

  //     expect(result.amount0.gt(0)).to.be.true;
  //     expect(result.amount1.gt(0)).to.be.true;
  //     expect(result.ticksProcessed).to.equal(2);
  //   });

  //   it("should handle multiple overlapping positions", async () => {
  //     const currentTick = 0;
  //     const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);
  //     const tickSpacing = 60;
  //     const poolLiquidity = ethers.utils.parseEther("1500");

  //     const mockPool = new MockPool(
  //       currentSqrtPrice,
  //       currentTick,
  //       poolLiquidity,
  //       tickSpacing,
  //     );

  //     // Position 1: [-180, 180] with liquidity 1000
  //     mockPool.setTick(
  //       -180,
  //       ethers.utils.parseEther("1000"),
  //       ethers.utils.parseEther("1000"),
  //     );
  //     mockPool.setTick(
  //       180,
  //       ethers.utils.parseEther("-1000"),
  //       ethers.utils.parseEther("1000"),
  //     );

  //     // Position 2: [-60, 60] with liquidity 500
  //     mockPool.setTick(
  //       -60,
  //       ethers.utils.parseEther("500"),
  //       ethers.utils.parseEther("500"),
  //     );
  //     mockPool.setTick(
  //       60,
  //       ethers.utils.parseEther("-500"),
  //       ethers.utils.parseEther("500"),
  //     );

  //     const result = await calculator.calculateTotalTokenAmounts(
  //       mockPool,
  //       18,
  //       18,
  //       1000,
  //     );

  //     expect(result.amount0.gt(0)).to.be.true;
  //     expect(result.amount1.gt(0)).to.be.true;
  //     expect(result.ticksProcessed).to.equal(4);
  //   });

  //   it("should handle price outside liquidity range", async () => {
  //     const currentTick = 300;
  //     const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);
  //     const tickSpacing = 60;
  //     const poolLiquidity = BigNumber.from(0); // No active liquidity at current price

  //     const mockPool = new MockPool(
  //       currentSqrtPrice,
  //       currentTick,
  //       poolLiquidity,
  //       tickSpacing,
  //     );

  //     // Position: [-120, 120] with liquidity 1000
  //     mockPool.setTick(
  //       -120,
  //       ethers.utils.parseEther("1000"),
  //       ethers.utils.parseEther("1000"),
  //     );
  //     mockPool.setTick(
  //       120,
  //       ethers.utils.parseEther("-1000"),
  //       ethers.utils.parseEther("1000"),
  //     );

  //     const result = await calculator.calculateTotalTokenAmounts(
  //       mockPool,
  //       18,
  //       18,
  //       1000,
  //     );

  //     // All liquidity should be in token1 since price is above range
  //     expect(result.amount0.toString()).to.equal("0");
  //     expect(result.amount1.gt(0)).to.be.true;
  //   });
  // });

  // describe("findActiveLiquidityRange", () => {
  //   it("should find correct liquidity boundaries", async () => {
  //     const currentTick = 0;
  //     const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);
  //     const tickSpacing = 60;
  //     const poolLiquidity = ethers.utils.parseEther("1000");

  //     const mockPool = new MockPool(
  //       currentSqrtPrice,
  //       currentTick,
  //       poolLiquidity,
  //       tickSpacing,
  //     );

  //     // Set up liquidity that extends from -180 to 180
  //     mockPool.setTick(
  //       -180,
  //       ethers.utils.parseEther("1000"),
  //       ethers.utils.parseEther("1000"),
  //     );
  //     mockPool.setTick(
  //       180,
  //       ethers.utils.parseEther("-1000"),
  //       ethers.utils.parseEther("1000"),
  //     );

  //     const { lowerBound, upperBound } =
  //       await calculator.findActiveLiquidityRange(
  //         mockPool,
  //         currentTick,
  //         tickSpacing,
  //       );

  //     expect(lowerBound).to.be.lte(-180);
  //     expect(upperBound).to.be.gte(180);
  //   });
  // });

  // describe("Edge cases", () => {
  //   it("should handle zero liquidity", async () => {
  //     const currentTick = 0;
  //     const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);
  //     const tickSpacing = 60;
  //     const poolLiquidity = BigNumber.from(0);

  //     const mockPool = new MockPool(
  //       currentSqrtPrice,
  //       currentTick,
  //       poolLiquidity,
  //       tickSpacing,
  //     );

  //     const result = await calculator.calculateTotalTokenAmounts(
  //       mockPool,
  //       18,
  //       18,
  //       1000,
  //     );

  //     expect(result.amount0.toString()).to.equal("0");
  //     expect(result.amount1.toString()).to.equal("0");
  //     expect(result.ticksProcessed).to.equal(0);
  //   });

  //   it("should handle negative liquidityNet accumulation", async () => {
  //     const currentTick = 0;
  //     const currentSqrtPrice = calculator.getSqrtRatioAtTick(currentTick);
  //     const tickSpacing = 60;
  //     const poolLiquidity = BigNumber.from(0);

  //     const mockPool = new MockPool(
  //       currentSqrtPrice,
  //       currentTick,
  //       poolLiquidity,
  //       tickSpacing,
  //     );

  //     // Intentionally create invalid state where liquidityNet would go negative
  //     mockPool.setTick(
  //       -60,
  //       ethers.utils.parseEther("-500"),
  //       ethers.utils.parseEther("500"),
  //     );
  //     mockPool.setTick(
  //       60,
  //       ethers.utils.parseEther("500"),
  //       ethers.utils.parseEther("500"),
  //     );

  //     const result = await calculator.calculateTotalTokenAmounts(
  //       mockPool,
  //       18,
  //       18,
  //       1000,
  //     );

  //     // Should handle gracefully without throwing
  //     expect(result).to.not.be.undefined;
  //   });
  // });
});
