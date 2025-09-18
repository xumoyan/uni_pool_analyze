const { ethers } = require("ethers")

async function debugBitmapParsing() {
  console.log("🔍 调试 bitmap 解析逻辑...")

  const RPC_URL = "http://10.8.6.153:2700"
  const STATE_VIEW_ADDRESS = "0x7ffe42c4a5deea5b0fec41c94c136cf115597227"
  const REAL_POOL_ID =
    "0x72331fcb696b0151904c03584b66dc8365bc63f8a144d89a773384e3a579ca73"

  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const stateView = new ethers.Contract(
    STATE_VIEW_ADDRESS,
    [
      "function getTickBitmap(bytes32 poolId, int16 tick) external view returns (uint256 tickBitmap)",
      "function getTickLiquidity(bytes32 poolId, int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet)",
    ],
    provider
  )

  try {
    // 测试我们之前成功找到的活跃区域
    const knownActiveWords = [-80, -79, -78, -77, -76]

    console.log("\n1. 验证已知活跃区域...")

    for (const word of knownActiveWords) {
      try {
        const bitmap = await stateView.getTickBitmap(REAL_POOL_ID, word)

        if (bitmap > 0) {
          console.log(`\n✅ Word ${word} 确实有活跃 ticks:`)
          console.log(`   bitmap: ${bitmap.toString(16)}`)
          console.log(
            `   bitmap (binary): ${bitmap
              .toString(2)
              .padStart(256, "0")
              .substring(0, 50)}...`
          )

          // 使用不同的方法解析 bitmap
          const foundTicks = []

          // 方法1: 使用 BigInt
          const bitmapBigInt = BigInt(bitmap.toString())
          for (let bit = 0; bit < 256; bit++) {
            if ((bitmapBigInt >> BigInt(bit)) & BigInt(1)) {
              const tick = word * 256 + bit
              foundTicks.push(tick)
            }
          }

          console.log(`   方法1 (BigInt): 找到 ${foundTicks.length} 个 ticks`)
          if (foundTicks.length > 0) {
            console.log(`   前几个: ${foundTicks.slice(0, 5).join(", ")}`)
          }

          // 方法2: 使用 ethers BigNumber
          const foundTicks2 = []
          for (let bit = 0; bit < 256; bit++) {
            try {
              const bitValue = bitmap.shr(bit).and(1)
              if (bitValue.gt(0)) {
                const tick = word * 256 + bit
                foundTicks2.push(tick)
              }
            } catch (e) {
              // 忽略错误
            }
          }

          console.log(`   方法2 (ethers): 找到 ${foundTicks2.length} 个 ticks`)
          if (foundTicks2.length > 0) {
            console.log(`   前几个: ${foundTicks2.slice(0, 5).join(", ")}`)
          }

          // 验证其中几个 tick 是否真的有流动性
          const ticksToTest = foundTicks.slice(0, 3)
          console.log(`\n   验证流动性:`)

          for (const tick of ticksToTest) {
            try {
              const tickLiquidity = await stateView.getTickLiquidity(
                REAL_POOL_ID,
                tick
              )
              console.log(
                `     Tick ${tick}: liquidityGross=${tickLiquidity.liquidityGross.toString()}`
              )
            } catch (error) {
              console.log(`     Tick ${tick}: 查询失败`)
            }
          }

          // 只处理第一个活跃区域，避免输出太多
          break
        }
      } catch (error) {
        console.log(`❌ Word ${word} 查询失败: ${error.message}`)
      }
    }

    console.log("\n🎯 诊断结论:")
    console.log("如果方法1和方法2都找到了 ticks，但后端日志显示0个，说明:")
    console.log("1. 后端的 bitmap 解析逻辑有问题")
    console.log("2. 可能是 ethers 版本兼容性问题")
    console.log("3. 需要修复后端的位运算逻辑")
  } catch (error) {
    console.error("❌ 调试失败:", error.message)
  }
}

debugBitmapParsing().catch(console.error)
