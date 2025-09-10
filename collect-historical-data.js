const axios = require("axios")

// 配置API基础URL
const API_BASE_URL = "http://localhost:3001"

// 创建axios实例
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5分钟超时，因为历史数据收集可能需要很长时间
})

async function collectHistoricalData() {
  try {
    console.log("🚀 开始收集所有池子的历史数据...")

    // 1. 获取所有池子
    console.log("📋 获取池子列表...")
    const poolsResponse = await api.get("/pools")

    if (!poolsResponse.data.success || !poolsResponse.data.data) {
      throw new Error("获取池子列表失败")
    }

    const pools = poolsResponse.data.data
    console.log(`✅ 找到 ${pools.length} 个池子`)

    // 2. 为每个池子收集历史数据
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i]
      console.log(
        `\n🔄 [${i + 1}/${pools.length}] 开始收集池子 ${pool.token0Symbol}-${
          pool.token1Symbol
        } 的历史数据...`
      )
      console.log(`   地址: ${pool.address}`)

      try {
        // 调用历史数据同步API
        const response = await api.post(
          "/revenue/sync-historical",
          {},
          {
            params: {
              poolAddress: pool.address,
              // 不指定startBlockNumber和endBlockNumber，让系统自动从池子创建开始收集
              blockInterval: 7200, // 每天约7200个块
            },
          }
        )

        if (response.data.success) {
          console.log(
            `   ✅ 成功同步 ${response.data.data.syncedRecords} 条记录`
          )
        } else {
          console.log(`   ❌ 同步失败: ${response.data.message}`)
        }

        // 稍微延迟一下，避免请求过于频繁
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.log(
          `   ❌ 收集失败: ${error.response?.data?.message || error.message}`
        )
        continue
      }
    }

    console.log("\n🎉 所有池子的历史数据收集完成！")
  } catch (error) {
    console.error("❌ 收集历史数据失败:", error.response?.data || error.message)
    process.exit(1)
  }
}

// 运行脚本
if (require.main === module) {
  collectHistoricalData()
}

module.exports = { collectHistoricalData }
