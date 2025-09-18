const { ethers } = require("ethers");

async function comprehensiveV4Debug() {
  console.log("🔍 全面调试 V4 数据获取...");
  
  const RPC_URL = "http://10.8.6.153:2700";
  const STATE_VIEW_ADDRESS = "0x7ffe42c4a5deea5b0fec41c94c136cf115597227";
  const REAL_POOL_ID = "0x72331fcb696b0151904c03584b66dc8365bc63f8a144d89a773384e3a579ca73";
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const stateView = new ethers.Contract(STATE_VIEW_ADDRESS, [
    "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
    "function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)",
    "function getTickBitmap(bytes32 poolId, int16 tick) external view returns (uint256 tickBitmap)",
    "function getTickLiquidity(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet)",
    "function getTickInfo(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128)",
  ], provider);
  
  try {
    // 1. 确认基本状态
    console.log("\n1. 确认基本状态...");
    const slot0 = await stateView.getSlot0(REAL_POOL_ID);
    const liquidity = await stateView.getLiquidity(REAL_POOL_ID);
    
    console.log(`✅ 当前 tick: ${slot0.tick}`);
    console.log(`✅ 总流动性: ${liquidity.toString()}`);
    console.log(`✅ sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
    
    // 2. 理解流动性的分布方式
    console.log("\n2. 理解流动性分布...");
    console.log("在 Uniswap V4 中，流动性可能以不同的方式分布:");
    console.log("- bitmap 标记初始化的 tick");
    console.log("- 但不是所有初始化的 tick 都有当前流动性");
    console.log("- 流动性可能集中在特定的价格区间");
    
    // 3. 尝试不同的方法找到真正有流动性的 tick
    console.log("\n3. 寻找真正有流动性的 tick...");
    
    const currentTick = parseInt(slot0.tick);
    console.log(`当前价格 tick: ${currentTick}`);
    
    // 策略A: 测试当前 tick 附近的区域
    console.log("\n策略A: 测试当前 tick 附近...");
    const nearbyTicks = [];
    for (let offset = -1000; offset <= 1000; offset += 10) {
      nearbyTicks.push(currentTick + offset);
    }
    
    let foundNearbyTicks = 0;
    for (const tick of nearbyTicks) {
      try {
        const tickLiquidity = await stateView.getTickLiquidity(REAL_POOL_ID, tick);
        if (tickLiquidity.liquidityGross > 0) {
          console.log(`✅ 当前附近有流动性的 tick: ${tick}, liquidity=${tickLiquidity.liquidityGross.toString()}`);
          foundNearbyTicks++;
          if (foundNearbyTicks >= 5) break; // 限制输出
        }
      } catch (error) {
        // 继续测试
      }
    }
    
    console.log(`在当前 tick 附近找到 ${foundNearbyTicks} 个有流动性的 tick`);
    
    // 策略B: 基于事件数据，我们知道的活跃 tick 范围
    console.log("\n策略B: 测试事件数据显示的活跃区域...");
    
    // 从我们之前的事件分析，我们知道活跃的 tick 范围大致在 -35639 到 -18970
    const eventBasedRange = {
      min: -35639,
      max: -18970
    };
    
    console.log(`测试事件显示的活跃范围: ${eventBasedRange.min} 到 ${eventBasedRange.max}`);
    
    let foundEventBasedTicks = 0;
    for (let tick = eventBasedRange.min; tick <= eventBasedRange.max; tick += 100) {
      try {
        const tickLiquidity = await stateView.getTickLiquidity(REAL_POOL_ID, tick);
        if (tickLiquidity.liquidityGross > 0) {
          console.log(`✅ 事件范围内有流动性的 tick: ${tick}, liquidity=${tickLiquidity.liquidityGross.toString()}`);
          foundEventBasedTicks++;
          if (foundEventBasedTicks >= 10) break; // 限制输出
        }
      } catch (error) {
        // 继续测试
      }
    }
    
    console.log(`在事件范围内找到 ${foundEventBasedTicks} 个有流动性的 tick`);
    
    // 策略C: 测试一些常见的价格点
    console.log("\n策略C: 测试常见价格点...");
    
    // 计算一些常见价格对应的 tick
    const commonPrices = [0.03, 0.035, 0.04, 0.045, 0.05, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08, 0.085, 0.09];
    const commonTicks = commonPrices.map(price => Math.floor(Math.log(price) / Math.log(1.0001)));
    
    let foundCommonTicks = 0;
    for (const tick of commonTicks) {
      try {
        const tickLiquidity = await stateView.getTickLiquidity(REAL_POOL_ID, tick);
        if (tickLiquidity.liquidityGross > 0) {
          const price = Math.pow(1.0001, tick);
          console.log(`✅ 常见价格点有流动性: tick=${tick}, price=${price.toFixed(6)}, liquidity=${tickLiquidity.liquidityGross.toString()}`);
          foundCommonTicks++;
        }
      } catch (error) {
        // 继续测试
      }
    }
    
    console.log(`在常见价格点找到 ${foundCommonTicks} 个有流动性的 tick`);
    
    // 4. 总结问题
    console.log("\n🎯 问题诊断:");
    if (foundNearbyTicks === 0 && foundEventBasedTicks === 0 && foundCommonTicks === 0) {
      console.log("❌ 所有策略都没有找到有流动性的 tick");
      console.log("可能的原因:");
      console.log("1. StateView 合约的 getTickLiquidity 方法可能有问题");
      console.log("2. 这个 poolId 在 StateView 中可能没有对应的数据");
      console.log("3. 需要使用不同的查询方法");
      console.log("4. 可能需要先初始化池子状态");
      
      // 最后尝试: 验证池子是否在 StateView 中存在
      console.log("\n最后验证: 检查池子基本信息是否正确...");
      console.log(`Pool 总流动性: ${liquidity.toString()}`);
      console.log(`如果总流动性 > 0 但找不到具体的 tick 流动性，说明查询方法有问题`);
      
    } else {
      console.log("✅ 找到了有流动性的 tick，问题可能在于:");
      console.log("1. 后端的扫描范围不对");
      console.log("2. 后端的 bitmap 解析逻辑需要优化");
      console.log("3. 需要调整扫描策略");
    }
    
  } catch (error) {
    console.error("❌ 全面调试失败:", error.message);
  }
}

comprehensiveV4Debug().catch(console.error);
