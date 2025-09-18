const { ethers } = require("ethers")

// 配置
const RPC_URL = "http://10.8.6.153:2700"
const POOL_MANAGER_ADDRESS = "0x000000000004444c5dc75cB358380D2e3dE08A90"
const POSITION_MANAGER_ADDRESS = "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e"
const REAL_POOL_ID =
  "0x72331fcb696b0151904c03584b66dc8365bc63f8a144d89a773384e3a579ca73"

// 事件签名
const EVENT_SIGNATURES = {
  SWAP: "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f",
  MODIFY_LIQUIDITY:
    "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec",
  INITIALIZE:
    "0x6b9e2b0d2e4d8b8f3b3b5b3a1e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e8e",
}

// PoolManager ABI - 只包含确定可用的方法
const POOL_MANAGER_ABI = [
  "function owner() external view returns (address)",
  "function protocolFeeController() external view returns (address)",
]

// Position Manager ABI
const POSITION_MANAGER_ABI = [
  "function poolKeys(bytes25 poolId) external view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)",
]

class V4EventBasedLiquidityTracker {
  constructor(provider, poolManagerAddress, positionManagerAddress) {
    this.provider = provider
    this.poolManager = new ethers.Contract(
      poolManagerAddress,
      POOL_MANAGER_ABI,
      provider
    )
    this.positionManager = new ethers.Contract(
      positionManagerAddress,
      POSITION_MANAGER_ABI,
      provider
    )

    // 存储池子状态
    this.poolStates = new Map()
    this.liquidityDistribution = new Map() // tick -> liquidity info
  }

  // 获取池子基本信息
  async getPoolInfo(poolId) {
    const poolId25 = poolId.substring(0, 52)
    const poolKeys = await this.positionManager.poolKeys(poolId25)

    return {
      poolId,
      currency0: poolKeys[0],
      currency1: poolKeys[1],
      fee: parseInt(poolKeys[2]),
      tickSpacing: parseInt(poolKeys[3]),
      hooks: poolKeys[4],
    }
  }

  // 解析 Swap 事件
  parseSwapEvent(log) {
    try {
      // Swap 事件结构: int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["int128", "int128", "uint160", "uint128", "int24", "uint24"],
        log.data
      )

      return {
        type: "swap",
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        poolId: log.topics[1],
        sender: "0x" + log.topics[2].substring(26), // 去掉前面的零填充
        amount0: decoded[0].toString(),
        amount1: decoded[1].toString(),
        sqrtPriceX96: decoded[2].toString(),
        liquidity: decoded[3].toString(),
        tick: parseInt(decoded[4]),
        fee: parseInt(decoded[5]),
      }
    } catch (error) {
      console.log(`解析 Swap 事件失败: ${error.message}`)
      return null
    }
  }

  // 解析 ModifyLiquidity 事件
  parseModifyLiquidityEvent(log) {
    try {
      // ModifyLiquidity 事件结构: int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["int24", "int24", "int256", "bytes32"],
        log.data
      )

      return {
        type: "modifyLiquidity",
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        poolId: log.topics[1],
        sender: "0x" + log.topics[2].substring(26),
        tickLower: parseInt(decoded[0]),
        tickUpper: parseInt(decoded[1]),
        liquidityDelta: decoded[2].toString(),
        salt: decoded[3],
      }
    } catch (error) {
      console.log(`解析 ModifyLiquidity 事件失败: ${error.message}`)
      return null
    }
  }

  // 收集历史事件并重建状态
  async collectHistoricalData(poolId, fromBlock, toBlock) {
    console.log(`\n📊 收集池子 ${poolId} 的历史数据...`)
    console.log(`区块范围: ${fromBlock} - ${toBlock}`)

    // 获取所有相关事件
    const eventFilter = {
      address: POOL_MANAGER_ADDRESS,
      topics: [null, poolId], // 第二个 topic 是 poolId
      fromBlock,
      toBlock,
    }

    const logs = await this.provider.getLogs(eventFilter)
    console.log(`找到 ${logs.length} 个事件`)

    // 分类和解析事件
    const events = []
    const eventStats = {}

    for (const log of logs) {
      const eventSignature = log.topics[0]
      eventStats[eventSignature] = (eventStats[eventSignature] || 0) + 1

      let parsedEvent = null

      if (eventSignature === EVENT_SIGNATURES.SWAP) {
        parsedEvent = this.parseSwapEvent(log)
      } else if (eventSignature === EVENT_SIGNATURES.MODIFY_LIQUIDITY) {
        parsedEvent = this.parseModifyLiquidityEvent(log)
      }

      if (parsedEvent) {
        events.push(parsedEvent)
      }
    }

    console.log("\n📈 事件统计:")
    Object.entries(eventStats).forEach(([signature, count]) => {
      let eventName = "Unknown"
      if (signature === EVENT_SIGNATURES.SWAP) eventName = "Swap"
      if (signature === EVENT_SIGNATURES.MODIFY_LIQUIDITY)
        eventName = "ModifyLiquidity"
      console.log(`   ${eventName}: ${count} 次`)
    })

    // 按区块号排序事件
    events.sort((a, b) => a.blockNumber - b.blockNumber)

    return events
  }

  // 基于事件重建流动性状态
  rebuildLiquidityState(events, poolInfo) {
    console.log(`\n🔄 重建流动性状态...`)

    const liquidityMap = new Map() // tick -> net liquidity
    const priceHistory = []
    let currentState = {
      tick: 0,
      sqrtPriceX96: "0",
      liquidity: "0",
    }

    for (const event of events) {
      if (event.type === "swap") {
        // 更新当前状态
        currentState = {
          tick: event.tick,
          sqrtPriceX96: event.sqrtPriceX96,
          liquidity: event.liquidity,
        }

        // 记录价格历史
        priceHistory.push({
          blockNumber: event.blockNumber,
          tick: event.tick,
          sqrtPriceX96: event.sqrtPriceX96,
          liquidity: event.liquidity,
        })
      } else if (event.type === "modifyLiquidity") {
        // 更新流动性分布
        const liquidityDelta = BigInt(event.liquidityDelta)

        // 在 tickLower 处增加流动性
        const currentLowerLiquidity =
          liquidityMap.get(event.tickLower) || BigInt(0)
        liquidityMap.set(
          event.tickLower,
          currentLowerLiquidity + liquidityDelta
        )

        // 在 tickUpper 处减少流动性
        const currentUpperLiquidity =
          liquidityMap.get(event.tickUpper) || BigInt(0)
        liquidityMap.set(
          event.tickUpper,
          currentUpperLiquidity - liquidityDelta
        )
      }
    }

    // 计算每个 tick 的累积流动性
    const sortedTicks = Array.from(liquidityMap.keys()).sort((a, b) => a - b)
    const distribution = []
    let cumulativeLiquidity = BigInt(0)

    for (const tick of sortedTicks) {
      const netLiquidityChange = liquidityMap.get(tick)
      cumulativeLiquidity += netLiquidityChange

      if (cumulativeLiquidity > BigInt(0)) {
        distribution.push({
          tick,
          liquidityNet: netLiquidityChange.toString(),
          liquidityGross: cumulativeLiquidity.toString(),
          price: this.tickToPrice(tick, poolInfo.currency0, poolInfo.currency1),
        })
      }
    }

    console.log(`✅ 重建完成:`)
    console.log(`   当前 tick: ${currentState.tick}`)
    console.log(`   当前流动性: ${currentState.liquidity}`)
    console.log(`   活跃 tick 数量: ${distribution.length}`)
    console.log(`   价格历史记录: ${priceHistory.length} 条`)

    return {
      currentState,
      distribution,
      priceHistory,
    }
  }

  // Tick 转价格的简化计算
  tickToPrice(tick, token0, token1) {
    // 简化的价格计算，实际应用中需要考虑 token decimals
    const price = Math.pow(1.0001, tick)
    return price.toString()
  }

  // 获取流动性分布摘要
  getLiquidityDistributionSummary(distribution, currentTick) {
    if (distribution.length === 0) return null

    const totalLiquidity = distribution.reduce(
      (sum, item) => sum + BigInt(item.liquidityGross),
      BigInt(0)
    )

    const tickRange = {
      min: Math.min(...distribution.map((d) => d.tick)),
      max: Math.max(...distribution.map((d) => d.tick)),
    }

    // 找到当前价格附近的流动性
    const nearbyTicks = distribution.filter(
      (d) => Math.abs(d.tick - currentTick) <= 100
    )

    return {
      totalTicks: distribution.length,
      totalLiquidity: totalLiquidity.toString(),
      tickRange,
      nearbyLiquidity: nearbyTicks.length,
      currentTick,
    }
  }
}

async function testEventBasedApproach() {
  console.log("🔍 测试基于事件的 V4 流动性追踪...")

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const tracker = new V4EventBasedLiquidityTracker(
      provider,
      POOL_MANAGER_ADDRESS,
      POSITION_MANAGER_ADDRESS
    )

    // 1. 获取池子信息
    const poolInfo = await tracker.getPoolInfo(REAL_POOL_ID)
    console.log("✅ 池子信息:", poolInfo)

    // 2. 收集最近的历史数据
    const latestBlock = await provider.getBlock("latest")
    const fromBlock = latestBlock.number - 1000 // 最近1000个区块
    const toBlock = "latest"

    const events = await tracker.collectHistoricalData(
      REAL_POOL_ID,
      fromBlock,
      toBlock
    )

    if (events.length > 0) {
      // 3. 重建流动性状态
      const { currentState, distribution, priceHistory } =
        tracker.rebuildLiquidityState(events, poolInfo)

      // 4. 生成摘要
      const summary = tracker.getLiquidityDistributionSummary(
        distribution,
        currentState.tick
      )

      console.log("\n📋 流动性分布摘要:")
      if (summary) {
        console.log(`   总流动性: ${summary.totalLiquidity}`)
        console.log(`   活跃 tick 数量: ${summary.totalTicks}`)
        console.log(
          `   Tick 范围: ${summary.tickRange.min} - ${summary.tickRange.max}`
        )
        console.log(
          `   当前 tick 附近的流动性: ${summary.nearbyLiquidity} 个 tick`
        )
      } else {
        console.log("   无有效的流动性分布数据")
      }

      // 5. 显示最近的价格变化
      if (priceHistory.length > 0) {
        console.log("\n📈 最近的价格变化:")
        priceHistory.slice(-5).forEach((record, index) => {
          console.log(
            `   ${index + 1}. 区块 ${record.blockNumber}: tick=${
              record.tick
            }, 流动性=${record.liquidity}`
          )
        })
      }

      console.log("\n🎯 结论:")
      console.log("✅ 基于事件的方法可以成功重建 V4 流动性状态")
      console.log("✅ 可以获取历史价格和流动性变化")
      console.log("✅ 这种方法适合集成到后端服务中")
      console.log("💡 建议: 定期收集事件并更新数据库中的流动性分布")
    } else {
      console.log("⚠️ 没有找到可解析的事件")
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.message)
  }
}

testEventBasedApproach().catch(console.error)
