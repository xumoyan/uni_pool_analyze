const { ethers } = require("ethers")

// 配置
const RPC_URL = "http://10.8.6.153:2700"
const STATE_VIEW_ADDRESS = "0x7ffe42c4a5deea5b0fec41c94c136cf115597227"
const REAL_POOL_ID =
  "0x72331fcb696b0151904c03584b66dc8365bc63f8a144d89a773384e3a579ca73"

// StateView ABI
const STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getTickBitmap(bytes32 poolId, int16 tick) external view returns (uint256 tickBitmap)",
  "function getTickLiquidity(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet)",
]

async function findActiveTicksExtensive() {
  console.log("🔍 扩大范围搜索活跃的 V4 ticks...")

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const stateView = new ethers.Contract(
      STATE_VIEW_ADDRESS,
      STATE_VIEW_ABI,
      provider
    )

    // 获取当前状态
    const slot0 = await stateView.getSlot0(REAL_POOL_ID)
    const currentTick = parseInt(slot0.tick)
    console.log(`当前 tick: ${currentTick}`)

    // 策略1: 大范围扫描 bitmap
    console.log("\n📊 策略1: 大范围扫描 bitmap...")
    const activeTicks = []

    // 扩大扫描范围到 ±1000 words
    const largeRange = 1000
    let scannedWords = 0
    let foundBitmaps = 0

    for (
      let word = Math.floor(currentTick / 256) - largeRange;
      word <= Math.floor(currentTick / 256) + largeRange;
      word += 10
    ) {
      // 每10个word扫描一次，加快速度

      try {
        const bitmap = await stateView.getTickBitmap(REAL_POOL_ID, word)
        scannedWords++

        if (bitmap !== 0n) {
          foundBitmaps++
          console.log(`✅ Word ${word} 有活跃 ticks: ${bitmap.toString(16)}`)

          // 解析这个 word 的所有活跃 ticks
          for (let bit = 0; bit < 256; bit++) {
            if ((bitmap >> BigInt(bit)) & 1n) {
              const tick = word * 256 + bit
              activeTicks.push(tick)
              console.log(`   发现 tick: ${tick}`)
            }
          }

          // 如果找到了一些，就在附近更仔细地搜索
          if (activeTicks.length > 0) {
            console.log(`在 word ${word} 附近进行细致扫描...`)
            for (let nearWord = word - 5; nearWord <= word + 5; nearWord++) {
              if (nearWord !== word) {
                try {
                  const nearBitmap = await stateView.getTickBitmap(
                    REAL_POOL_ID,
                    nearWord
                  )
                  if (nearBitmap !== 0n) {
                    console.log(
                      `✅ 附近 Word ${nearWord}: ${nearBitmap.toString(16)}`
                    )
                    for (let bit = 0; bit < 256; bit++) {
                      if ((nearBitmap >> BigInt(bit)) & 1n) {
                        const nearTick = nearWord * 256 + bit
                        if (!activeTicks.includes(nearTick)) {
                          activeTicks.push(nearTick)
                          console.log(`   发现附近 tick: ${nearTick}`)
                        }
                      }
                    }
                  }
                } catch (e) {
                  // 忽略错误
                }
              }
            }
          }
        }

        // 限制找到的数量，避免过多
        if (activeTicks.length >= 50) break
      } catch (error) {
        // 继续扫描其他 word
      }
    }

    console.log(
      `\n扫描了 ${scannedWords} 个 words，找到 ${foundBitmaps} 个有活跃 ticks 的 bitmap`
    )
    console.log(`总共发现 ${activeTicks.length} 个活跃的 ticks`)

    // 策略2: 如果没找到，尝试直接测试一些常见的 tick 值
    if (activeTicks.length === 0) {
      console.log("\n📊 策略2: 直接测试常见的 tick 值...")

      // 基于 tickSpacing=10，测试一些可能的 tick 值
      const testTicks = []

      // 在当前 tick 附近测试
      for (let i = -1000; i <= 1000; i += 10) {
        testTicks.push(currentTick + i)
      }

      // 添加一些常见的价格点 tick
      const commonTicks = [
        -887270, -800000, -700000, -600000, -500000, -400000, -300000, -200000,
        -100000, 0, 100000, 200000, 300000, 400000, 500000, 600000, 700000,
        800000, 887270,
      ]
      testTicks.push(...commonTicks)

      console.log(`测试 ${testTicks.length} 个可能的 tick 值...`)

      for (const tick of testTicks) {
        try {
          const tickLiquidity = await stateView.getTickLiquidity(
            REAL_POOL_ID,
            tick
          )
          if (tickLiquidity.liquidityGross > 0) {
            activeTicks.push(tick)
            console.log(`✅ 发现有流动性的 tick: ${tick}`)
            console.log(
              `   liquidityGross: ${tickLiquidity.liquidityGross.toString()}`
            )
            console.log(
              `   liquidityNet: ${tickLiquidity.liquidityNet.toString()}`
            )
          }
        } catch (error) {
          // 继续测试下一个
        }

        // 限制数量
        if (activeTicks.length >= 20) break
      }
    }

    // 策略3: 从事件日志中推断可能的 tick 值
    if (activeTicks.length === 0) {
      console.log("\n📊 策略3: 从历史事件推断可能的 tick...")

      // 这里可以从我们之前获取的事件数据中提取 tick 值
      // 基于之前的成功测试，我们知道有一些 tick 值
      const eventBasedTicks = [
        -191970, -191960, -191950, -191980, -191990, -192000,
      ]

      for (const tick of eventBasedTicks) {
        try {
          const tickLiquidity = await stateView.getTickLiquidity(
            REAL_POOL_ID,
            tick
          )
          if (tickLiquidity.liquidityGross > 0) {
            activeTicks.push(tick)
            console.log(`✅ 事件推断的活跃 tick: ${tick}`)
            console.log(
              `   liquidityGross: ${tickLiquidity.liquidityGross.toString()}`
            )
          }
        } catch (error) {
          console.log(`❌ Tick ${tick} 查询失败`)
        }
      }
    }

    console.log(`\n🎯 最终结果:`)
    console.log(`找到 ${activeTicks.length} 个活跃的 ticks`)

    if (activeTicks.length > 0) {
      activeTicks.sort((a, b) => a - b)
      console.log(
        `Tick 范围: ${activeTicks[0]} - ${activeTicks[activeTicks.length - 1]}`
      )
      console.log(
        `当前 tick (${currentTick}) 在范围内: ${
          activeTicks[0] <= currentTick &&
          currentTick <= activeTicks[activeTicks.length - 1]
            ? "是"
            : "否"
        }`
      )

      console.log("\n前几个活跃 ticks:")
      activeTicks.slice(0, 10).forEach((tick) => {
        console.log(`   ${tick} (价格: ${Math.pow(1.0001, tick).toFixed(8)})`)
      })
    } else {
      console.log("⚠️ 没有找到活跃的 ticks")
      console.log("可能的原因:")
      console.log("1. 流动性分布在我们没有扫描到的区域")
      console.log("2. V4 的 bitmap 存储方式与预期不同")
      console.log("3. 需要更大的扫描范围或不同的扫描策略")
    }

    return activeTicks
  } catch (error) {
    console.error("❌ 搜索失败:", error.message)
  }
}

findActiveTicksExtensive().catch(console.error)
