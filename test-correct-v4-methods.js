const { ethers } = require("ethers")

// 配置
const RPC_URL = "http://10.8.6.153:2700"
const POOL_MANAGER_ADDRESS = "0x000000000004444c5dc75cB358380D2e3dE08A90"
const POSITION_MANAGER_ADDRESS = "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e"
const REAL_POOL_ID =
  "0x72331fcb696b0151904c03584b66dc8365bc63f8a144d89a773384e3a579ca73"

// 正确的 PoolManager ABI - 基于你提供的方法
const POOL_MANAGER_ABI = [
  // 基本查询方法
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity)",
  "function ticks(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)",
  "function tickBitmap(bytes32 poolId, int16 wordPosition) external view returns (uint256)",

  // 存储槽读取（备用）
  "function extsload(bytes32 slot) external view returns (bytes32)",

  // 基本方法
  "function owner() external view returns (address)",
]

// Position Manager ABI
const POSITION_MANAGER_ABI = [
  "function poolKeys(bytes25 poolId) external view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
]

async function testCorrectV4Methods() {
  console.log("🔍 使用正确的 V4 方法测试流动性获取...")

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const poolManager = new ethers.Contract(
      POOL_MANAGER_ADDRESS,
      POOL_MANAGER_ABI,
      provider
    )
    const positionManager = new ethers.Contract(
      POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI,
      provider
    )

    // 1. 获取池子基本信息
    console.log("\n1. 获取池子基本信息...")
    const poolId25 = REAL_POOL_ID.substring(0, 52)
    const poolKeys = await positionManager.poolKeys(poolId25)

    console.log("✅ 池子信息:")
    console.log(`   currency0: ${poolKeys[0]} (ETH)`)
    console.log(`   currency1: ${poolKeys[1]} (USDT)`)
    console.log(`   fee: ${poolKeys[2]}`)
    console.log(`   tickSpacing: ${poolKeys[3]}`)
    console.log(`   hooks: ${poolKeys[4]}`)

    const tickSpacing = parseInt(poolKeys[3])

    // 2. 测试直接方法调用
    console.log("\n2. 测试直接方法调用...")

    try {
      const slot0 = await poolManager.getSlot0(REAL_POOL_ID)
      console.log("✅ getSlot0 成功:")
      console.log(`   sqrtPriceX96: ${slot0[0].toString()}`)
      console.log(`   tick: ${slot0[1]}`)
      console.log(`   protocolFee: ${slot0[2]}`)
      console.log(`   lpFee: ${slot0[3]}`)

      const currentTick = parseInt(slot0[1])

      // 3. 获取总流动性
      console.log("\n3. 获取总流动性...")
      const liquidity = await poolManager.getLiquidity(REAL_POOL_ID)
      console.log(`✅ getLiquidity 成功: ${liquidity.toString()}`)

      // 4. 测试特定 tick 的流动性
      console.log("\n4. 测试特定 tick 的流动性...")

      // 测试当前 tick 附近的一些 tick
      const testTicks = [
        currentTick,
        Math.floor(currentTick / tickSpacing) * tickSpacing, // 对齐到 tickSpacing
        Math.floor(currentTick / tickSpacing) * tickSpacing + tickSpacing,
        Math.floor(currentTick / tickSpacing) * tickSpacing - tickSpacing,
      ]

      for (const tick of testTicks) {
        try {
          const tickInfo = await poolManager.ticks(REAL_POOL_ID, tick)
          console.log(`✅ Tick ${tick}:`)
          console.log(
            `   liquidityGross: ${tickInfo.liquidityGross.toString()}`
          )
          console.log(`   liquidityNet: ${tickInfo.liquidityNet.toString()}`)
          console.log(`   initialized: ${tickInfo.initialized}`)
        } catch (error) {
          console.log(
            `❌ Tick ${tick} 查询失败: ${error.message.split("(")[0]}`
          )
        }
      }

      // 5. 使用 tickBitmap 查找活跃的 ticks
      console.log("\n5. 使用 tickBitmap 查找活跃的 ticks...")

      // 定义扫描范围
      const range = 50 // 扫描当前 tick 前后 50 个 tick spacing
      const minTick = currentTick - range * tickSpacing
      const maxTick = currentTick + range * tickSpacing

      console.log(
        `扫描范围: ${minTick} 到 ${maxTick} (当前 tick: ${currentTick})`
      )

      const activeTicks = []

      // 扫描 tickBitmap
      for (
        let word = Math.floor(minTick / 256);
        word <= Math.floor(maxTick / 256);
        word++
      ) {
        try {
          const bitmap = await poolManager.tickBitmap(REAL_POOL_ID, word)

          if (!bitmap.isZero()) {
            console.log(`✅ Word ${word} 有活跃 ticks: ${bitmap.toHexString()}`)

            // 解析 bitmap 中的活跃位
            const bitmapBigInt = bitmap.toBigInt()
            for (let bit = 0; bit < 256; bit++) {
              if ((bitmapBigInt >> BigInt(bit)) & BigInt(1)) {
                const tick = word * 256 + bit
                if (
                  tick >= minTick &&
                  tick <= maxTick &&
                  tick % tickSpacing === 0
                ) {
                  activeTicks.push(tick)
                  console.log(`   发现活跃 tick: ${tick}`)
                }
              }
            }
          }
        } catch (error) {
          console.log(
            `❌ Word ${word} 查询失败: ${error.message.split("(")[0]}`
          )
        }
      }

      console.log(`\n找到 ${activeTicks.length} 个活跃的 ticks`)

      // 6. 获取流动性分布
      console.log("\n6. 获取流动性分布...")

      if (activeTicks.length > 0) {
        const distribution = []

        for (const tick of activeTicks.slice(0, 10)) {
          // 只处理前10个
          try {
            const tickInfo = await poolManager.ticks(REAL_POOL_ID, tick)
            if (tickInfo.initialized) {
              distribution.push({
                tick: tick,
                liquidityGross: tickInfo.liquidityGross.toString(),
                liquidityNet: tickInfo.liquidityNet.toString(),
                initialized: tickInfo.initialized,
              })

              console.log(`✅ Tick ${tick} 流动性:`)
              console.log(
                `   liquidityGross: ${tickInfo.liquidityGross.toString()}`
              )
              console.log(
                `   liquidityNet: ${tickInfo.liquidityNet.toString()}`
              )
            }
          } catch (error) {
            console.log(
              `❌ Tick ${tick} 详情查询失败: ${error.message.split("(")[0]}`
            )
          }
        }

        console.log(`\n✅ 成功获取 ${distribution.length} 个 tick 的流动性分布`)

        if (distribution.length > 0) {
          console.log("\n📊 流动性分布摘要:")
          const totalGross = distribution.reduce(
            (sum, item) => sum + BigInt(item.liquidityGross),
            BigInt(0)
          )
          console.log(`   总 liquidityGross: ${totalGross.toString()}`)
          console.log(
            `   tick 范围: ${Math.min(
              ...distribution.map((d) => d.tick)
            )} 到 ${Math.max(...distribution.map((d) => d.tick))}`
          )
        }
      } else {
        console.log("⚠️ 在指定范围内没有找到活跃的 ticks")
        console.log("可能的原因:")
        console.log("1. 扫描范围太小")
        console.log("2. 池子的流动性集中在其他区域")
        console.log("3. tickSpacing 计算有误")
      }
    } catch (error) {
      console.log(`❌ 直接方法调用失败: ${error.message}`)
      console.log("这可能意味着 PoolManager 不支持这些方法，或者 ABI 不正确")
    }

    // 7. 验证池子是否真的有流动性（通过事件）
    console.log("\n7. 通过事件验证池子活动...")

    const latestBlock = await provider.getBlock("latest")
    const eventFilter = {
      address: POOL_MANAGER_ADDRESS,
      topics: [null, REAL_POOL_ID],
      fromBlock: latestBlock.number - 100,
      toBlock: "latest",
    }

    const logs = await provider.getLogs(eventFilter)
    console.log(`✅ 找到 ${logs.length} 个相关事件`)

    if (logs.length > 0) {
      // 统计事件类型
      const eventTypes = {}
      logs.forEach((log) => {
        const signature = log.topics[0]
        eventTypes[signature] = (eventTypes[signature] || 0) + 1
      })

      console.log("事件类型统计:")
      Object.entries(eventTypes).forEach(([signature, count]) => {
        let eventName = "Unknown"
        if (
          signature ===
          "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"
        ) {
          eventName = "Swap"
        } else if (
          signature ===
          "0x3c6d5b8a8b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b"
        ) {
          eventName = "ModifyLiquidity"
        }
        console.log(`   ${eventName} (${signature}): ${count} 次`)
      })
    }

    console.log("\n🎯 总结:")
    console.log("✅ 使用了你提供的正确方法")
    console.log("✅ 可以验证池子的存在和活动")

    if (activeTicks.length > 0) {
      console.log("✅ 成功找到并获取了流动性分布数据")
      console.log("💡 可以将这个方法集成到后端服务中")
    } else {
      console.log("⚠️ 需要调整扫描策略或检查池子状态")
      console.log("💡 建议扩大扫描范围或使用事件日志重建流动性分布")
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.message)
  }
}

testCorrectV4Methods().catch(console.error)
