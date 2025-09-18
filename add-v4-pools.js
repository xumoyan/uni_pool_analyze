const axios = require("axios")

const API_BASE_URL = "http://localhost:3001"

// Uniswap V4 测试池子配置
// 注意：这些是示例配置，实际使用时需要替换为真实的 V4 池子参数
const V4_POOLS = [
  {
    token0Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    token1Address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    feeTier: 3000, // 0.3%
    tickSpacing: 60,
    hooksAddress: "0x0000000000000000000000000000000000000000", // 无 hooks
  },
  {
    token0Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    token1Address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    feeTier: 500, // 0.05%
    tickSpacing: 10,
    hooksAddress: "0x0000000000000000000000000000000000000000", // 无 hooks
  },
  {
    token0Address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
    token1Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    feeTier: 3000, // 0.3%
    tickSpacing: 60,
    hooksAddress: "0x0000000000000000000000000000000000000000", // 无 hooks
  },
  {
    token0Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    token1Address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    feeTier: 3000, // 0.3%
    tickSpacing: 60,
    hooksAddress: "0x0000000000000000000000000000000000000000", // 无 hooks
  },
  {
    token0Address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    token1Address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    feeTier: 100, // 0.01%
    tickSpacing: 1,
    hooksAddress: "0x0000000000000000000000000000000000000000", // 无 hooks
  },
]

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

async function addV4Pools() {
  console.log("🚀 开始添加 Uniswap V4 池子...")

  for (let i = 0; i < V4_POOLS.length; i++) {
    const poolConfig = V4_POOLS[i]
    console.log(`\n添加第 ${i + 1}/${V4_POOLS.length} 个 V4 池子:`)
    console.log(`  Token0: ${poolConfig.token0Address}`)
    console.log(`  Token1: ${poolConfig.token1Address}`)
    console.log(`  费率: ${poolConfig.feeTier / 10000}%`)
    console.log(`  Tick间距: ${poolConfig.tickSpacing}`)
    console.log(`  Hooks: ${poolConfig.hooksAddress}`)

    try {
      // 首先计算 PoolId
      const poolIdResponse = await api.post(
        "/pools-v4/calculate-pool-id",
        poolConfig
      )
      const { poolId, poolKey } = poolIdResponse.data
      console.log(`  计算的 PoolId: ${poolId}`)

      // 检查池子是否已存在
      const existingResponse = await api.get("/pools-v4/find-by-tokens", {
        params: {
          token0Address: poolConfig.token0Address,
          token1Address: poolConfig.token1Address,
          feeTier: poolConfig.feeTier,
          tickSpacing: poolConfig.tickSpacing,
          hooksAddress: poolConfig.hooksAddress,
        },
      })

      if (existingResponse.data.found) {
        console.log(`  ⚠️  池子已存在，跳过`)
        continue
      }

      // 创建池子
      const createResponse = await api.post("/pools-v4", poolConfig)

      if (createResponse.status === 201) {
        console.log(`  ✅ V4 池子创建成功`)
        console.log(`     PoolId: ${createResponse.data.poolId}`)
        console.log(`     Token0: ${createResponse.data.token0Symbol}`)
        console.log(`     Token1: ${createResponse.data.token1Symbol}`)
      }

      // 添加延迟避免请求过于频繁
      await new Promise((resolve) => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(
        `  ❌ 创建 V4 池子失败:`,
        error.response?.data || error.message
      )

      // 如果是网络错误，等待更长时间后继续
      if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
        console.log(`  ⏳ 等待 5 秒后继续...`)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  console.log("\n🎉 V4 池子添加完成！")

  // 显示所有 V4 池子
  try {
    const allPoolsResponse = await api.get("/pools-v4")
    console.log(
      `\n📊 当前系统中的 V4 池子总数: ${allPoolsResponse.data.length}`
    )

    allPoolsResponse.data.forEach((pool, index) => {
      console.log(
        `  ${index + 1}. ${pool.token0Symbol}/${pool.token1Symbol} (${
          pool.feeTier / 10000
        }%)`
      )
      console.log(`     PoolId: ${pool.poolId}`)
      console.log(`     Hooks: ${pool.hooksAddress}`)
    })
  } catch (error) {
    console.error("获取 V4 池子列表失败:", error.message)
  }
}

// 错误处理
process.on("unhandledRejection", (reason, promise) => {
  console.error("未处理的 Promise 拒绝:", reason)
  process.exit(1)
})

process.on("uncaughtException", (error) => {
  console.error("未捕获的异常:", error)
  process.exit(1)
})

// 运行脚本
addV4Pools().catch((error) => {
  console.error("脚本执行失败:", error)
  process.exit(1)
})
