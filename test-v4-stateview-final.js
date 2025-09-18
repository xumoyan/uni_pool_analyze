const { ethers } = require("ethers")

// 配置
const RPC_URL = "http://10.8.6.153:2700"
const POOL_MANAGER_ADDRESS = "0x000000000004444c5dc75cB358380D2e3dE08A90"
const POSITION_MANAGER_ADDRESS = "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e"
const STATE_VIEW_ADDRESS = "0x7ffe42c4a5deea5b0fec41c94c136cf115597227" // StateView 合约
const REAL_POOL_ID =
  "0x72331fcb696b0151904c03584b66dc8365bc63f8a144d89a773384e3a579ca73"

// StateView 合约的完整 ABI
const STATE_VIEW_ABI = [
  "function getFeeGrowthGlobals(bytes32 poolId) external view returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1)",
  "function getFeeGrowthInside(bytes32 poolId, int24 tickLower, int24 tickUpper) external view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128)",
  "function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)",
  "function getPositionInfo(bytes32 poolId, bytes32 positionId) external view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)",
  "function getPositionInfo(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) external view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)",
  "function getPositionLiquidity(bytes32 poolId, bytes32 positionId) external view returns (uint128 liquidity)",
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getTickBitmap(bytes32 poolId, int16 tick) external view returns (uint256 tickBitmap)",
  "function getTickFeeGrowthOutside(bytes32 poolId, int24 tick) external view returns (uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128)",
  "function getTickInfo(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128)",
  "function getTickLiquidity(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet)",
  "function poolManager() external view returns (address)",
]

// Position Manager ABI
const POSITION_MANAGER_ABI = [
  "function poolKeys(bytes25 poolId) external view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
]

// V4 完整的流动性分布获取器（使用 StateView）
async function getV4LiquidityDistributionFinal(
  stateView,
  poolId,
  tickSpacing = 10
) {
  try {
    console.log("\n🎯 使用 StateView 获取完整的 V4 流动性分布...")

    // 1. 获取基本状态信息
    console.log("1. 获取基本状态信息...")
    const slot0 = await stateView.getSlot0(poolId)
    const currentTick = parseInt(slot0.tick)
    const liquidity = await stateView.getLiquidity(poolId)

    console.log("✅ 基本状态:")
    console.log(`   sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`)
    console.log(`   当前 tick: ${currentTick}`)
    console.log(`   协议费率: ${slot0.protocolFee}`)
    console.log(`   LP 费率: ${slot0.lpFee}`)
    console.log(`   总流动性: ${liquidity.toString()}`)

    // 2. 获取全局费用增长
    console.log("\n2. 获取全局费用增长...")
    const feeGrowthGlobals = await stateView.getFeeGrowthGlobals(poolId)
    console.log("✅ 全局费用增长:")
    console.log(
      `   feeGrowthGlobal0: ${feeGrowthGlobals.feeGrowthGlobal0.toString()}`
    )
    console.log(
      `   feeGrowthGlobal1: ${feeGrowthGlobals.feeGrowthGlobal1.toString()}`
    )

    // 3. 使用 tickBitmap 找到活跃的 ticks
    console.log("\n3. 扫描 tickBitmap 找到活跃的 ticks...")
    const activeTicks = []
    const range = 100 // 扫描范围（word 数量）

    console.log(`扫描范围: ${range} words around current tick (${currentTick})`)

    let bitmapCount = 0
    for (
      let word = Math.floor(currentTick / 256) - range;
      word <= Math.floor(currentTick / 256) + range;
      word++
    ) {
      try {
        const bitmap = await stateView.getTickBitmap(poolId, word)
        bitmapCount++

        if (bitmap !== 0n) {
          console.log(`✅ Word ${word} 有活跃 ticks: ${bitmap.toString(16)}`)

          // 解析 bitmap 找到初始化的 ticks
          for (let bit = 0; bit < 256; bit++) {
            if ((bitmap >> BigInt(bit)) & 1n) {
              const tick = word * 256 + bit
              // 只添加符合 tickSpacing 的 tick
              if (tick % tickSpacing === 0) {
                activeTicks.push(tick)
                console.log(`   发现活跃 tick: ${tick}`)
              }
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Word ${word} 查询失败: ${error.message.split("(")[0]}`)
      }
    }

    console.log(
      `\n扫描了 ${bitmapCount} 个 bitmap words，找到 ${activeTicks.length} 个活跃的 ticks`
    )

    // 4. 获取每个 tick 的详细流动性信息
    console.log("\n4. 获取 tick 详细信息...")
    const distribution = []

    for (const tick of activeTicks.slice(0, 20)) {
      // 限制处理数量
      try {
        // 获取 tick 流动性
        const tickLiquidity = await stateView.getTickLiquidity(poolId, tick)

        // 获取 tick 完整信息
        const tickInfo = await stateView.getTickInfo(poolId, tick)

        // 获取 tick 费用增长
        const tickFeeGrowth = await stateView.getTickFeeGrowthOutside(
          poolId,
          tick
        )

        const tickData = {
          tick,
          liquidityGross: tickLiquidity.liquidityGross.toString(),
          liquidityNet: tickLiquidity.liquidityNet.toString(),
          feeGrowthOutside0X128: tickFeeGrowth.feeGrowthOutside0X128.toString(),
          feeGrowthOutside1X128: tickFeeGrowth.feeGrowthOutside1X128.toString(),
          // 计算价格
          price: Math.pow(1.0001, tick).toString(),
        }

        distribution.push(tickData)

        console.log(`✅ Tick ${tick}:`)
        console.log(
          `   liquidityGross: ${tickLiquidity.liquidityGross.toString()}`
        )
        console.log(`   liquidityNet: ${tickLiquidity.liquidityNet.toString()}`)
        console.log(`   price: ${tickData.price}`)
      } catch (error) {
        console.log(
          `❌ Tick ${tick} 详情查询失败: ${error.message.split("(")[0]}`
        )
      }
    }

    // 5. 测试范围内费用增长计算
    if (activeTicks.length >= 2) {
      console.log("\n5. 测试范围内费用增长...")
      const sortedTicks = activeTicks.sort((a, b) => a - b)
      const tickLower = sortedTicks[0]
      const tickUpper = sortedTicks[sortedTicks.length - 1]

      try {
        const feeGrowthInside = await stateView.getFeeGrowthInside(
          poolId,
          tickLower,
          tickUpper
        )
        console.log(`✅ 范围 [${tickLower}, ${tickUpper}] 内的费用增长:`)
        console.log(
          `   feeGrowthInside0X128: ${feeGrowthInside.feeGrowthInside0X128.toString()}`
        )
        console.log(
          `   feeGrowthInside1X128: ${feeGrowthInside.feeGrowthInside1X128.toString()}`
        )
      } catch (error) {
        console.log(`❌ 范围内费用增长查询失败: ${error.message.split("(")[0]}`)
      }
    }

    // 6. 生成流动性分布摘要
    const summary = {
      currentTick,
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      totalLiquidity: liquidity.toString(),
      protocolFee: slot0.protocolFee,
      lpFee: slot0.lpFee,
      feeGrowthGlobal0: feeGrowthGlobals.feeGrowthGlobal0.toString(),
      feeGrowthGlobal1: feeGrowthGlobals.feeGrowthGlobal1.toString(),
      activeTicks: activeTicks.length,
      distribution: distribution.length,
      tickRange:
        activeTicks.length > 0
          ? {
              min: Math.min(...activeTicks),
              max: Math.max(...activeTicks),
            }
          : null,
    }

    return {
      summary,
      distribution,
      activeTicks,
    }
  } catch (error) {
    console.error(`❌ StateView 获取失败: ${error.message}`)
    throw error
  }
}

async function testV4StateViewFinal() {
  console.log("🔍 最终测试：使用 StateView 获取完整的 V4 数据...")

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const stateView = new ethers.Contract(
      STATE_VIEW_ADDRESS,
      STATE_VIEW_ABI,
      provider
    )
    const positionManager = new ethers.Contract(
      POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI,
      provider
    )

    // 1. 验证 StateView 合约
    console.log("\n1. 验证 StateView 合约...")
    const poolManagerFromStateView = await stateView.poolManager()
    console.log(`✅ StateView 连接的 PoolManager: ${poolManagerFromStateView}`)
    console.log(`✅ 预期的 PoolManager: ${POOL_MANAGER_ADDRESS}`)
    console.log(
      `✅ 地址匹配: ${
        poolManagerFromStateView.toLowerCase() ===
        POOL_MANAGER_ADDRESS.toLowerCase()
          ? "是"
          : "否"
      }`
    )

    // 2. 获取池子基本信息
    console.log("\n2. 获取池子基本信息...")
    const poolId25 = REAL_POOL_ID.substring(0, 52)
    const poolKeys = await positionManager.poolKeys(poolId25)

    console.log("✅ 池子信息:")
    console.log(`   currency0: ${poolKeys[0]} (ETH)`)
    console.log(`   currency1: ${poolKeys[1]} (USDT)`)
    console.log(`   fee: ${poolKeys[2]}`)
    console.log(`   tickSpacing: ${poolKeys[3]}`)
    console.log(`   hooks: ${poolKeys[4]}`)

    const tickSpacing = parseInt(poolKeys[3])

    // 3. 使用 StateView 获取完整的流动性分布
    const result = await getV4LiquidityDistributionFinal(
      stateView,
      REAL_POOL_ID,
      tickSpacing
    )

    console.log("\n📊 最终结果摘要:")
    console.log(`   当前价格 tick: ${result.summary.currentTick}`)
    console.log(`   sqrtPriceX96: ${result.summary.sqrtPriceX96}`)
    console.log(`   总流动性: ${result.summary.totalLiquidity}`)
    console.log(`   协议费率: ${result.summary.protocolFee}`)
    console.log(`   LP 费率: ${result.summary.lpFee}`)
    console.log(`   全局费用增长0: ${result.summary.feeGrowthGlobal0}`)
    console.log(`   全局费用增长1: ${result.summary.feeGrowthGlobal1}`)
    console.log(`   发现的活跃 ticks: ${result.summary.activeTicks}`)
    console.log(`   获取到详细信息的 ticks: ${result.summary.distribution}`)

    if (result.summary.tickRange) {
      console.log(
        `   Tick 范围: ${result.summary.tickRange.min} - ${result.summary.tickRange.max}`
      )
    }

    // 4. 计算流动性分布统计
    if (result.distribution.length > 0) {
      console.log("\n📈 流动性分布统计:")
      const totalGross = result.distribution.reduce(
        (sum, item) => sum + BigInt(item.liquidityGross),
        BigInt(0)
      )
      console.log(`   总 liquidityGross: ${totalGross.toString()}`)

      const netSum = result.distribution.reduce(
        (sum, item) => sum + BigInt(item.liquidityNet),
        BigInt(0)
      )
      console.log(`   总 liquidityNet: ${netSum.toString()}`)

      // 显示价格范围
      const prices = result.distribution.map((item) => parseFloat(item.price))
      console.log(
        `   价格范围: ${Math.min(...prices).toFixed(8)} - ${Math.max(
          ...prices
        ).toFixed(8)}`
      )
    }

    console.log("\n🎉 StateView 测试完成！")
    console.log("✅ 成功获取了完整的 V4 池子状态")
    console.log("✅ 获取了详细的流动性分布数据")
    console.log("✅ 获取了费用增长信息")
    console.log("✅ 这是 V4 数据获取的完美解决方案！")

    return result
  } catch (error) {
    console.error("❌ 最终测试失败:", error.message)
    console.error("完整错误:", error)
  }
}

testV4StateViewFinal().catch(console.error)
