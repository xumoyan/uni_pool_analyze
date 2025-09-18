const axios = require("axios")

const API_BASE_URL = "http://localhost:3001"

async function testRealPoolId() {
  console.log("🔍 测试真实 PoolId...")

  try {
    // 1. 计算真实池子的 PoolId（ETH/USDT 500 费率）
    console.log("\n1. 计算真实池子的 PoolId...")
    const realPoolParams = {
      token0Address: "0x0000000000000000000000000000000000000000", // ETH (零地址)
      token1Address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
      feeTier: 500,
      tickSpacing: 10,
      hooksAddress: "0x0000000000000000000000000000000000000000",
    }

    const poolIdResponse = await axios.post(
      `${API_BASE_URL}/pools-v4/calculate-pool-id`,
      realPoolParams
    )
    const calculatedPoolId = poolIdResponse.data.poolId
    const expectedPoolId =
      "0x72331fcb696b0151904c03584b66dc8365bc63f8a144d89a773384e3a579ca73"

    console.log(`计算的 PoolId: ${calculatedPoolId}`)
    console.log(`期望的 PoolId:  ${expectedPoolId}`)
    console.log(
      `匹配结果: ${
        calculatedPoolId.toLowerCase() === expectedPoolId.toLowerCase()
          ? "✅ 匹配"
          : "❌ 不匹配"
      }`
    )

    // 2. 检查这个池子是否已经在我们的数据库中
    console.log("\n2. 检查池子是否在数据库中...")
    try {
      const existingPool = await axios.get(
        `${API_BASE_URL}/pools-v4/${calculatedPoolId}`
      )
      console.log("✅ 池子已存在于数据库中")
      console.log(`   Token0: ${existingPool.data.token0Symbol}`)
      console.log(`   Token1: ${existingPool.data.token1Symbol}`)
    } catch (error) {
      if (error.response?.status === 404) {
        console.log("⚠️ 池子不存在，需要创建")

        // 3. 创建真实的池子
        console.log("\n3. 创建真实池子...")
        const createResponse = await axios.post(
          `${API_BASE_URL}/pools-v4`,
          realPoolParams
        )
        console.log("✅ 真实池子创建成功")
        console.log(`   PoolId: ${createResponse.data.poolId}`)
      } else {
        console.log("❌ 检查池子失败:", error.response?.data || error.message)
      }
    }

    // 4. 测试真实池子的数据收集
    console.log("\n4. 测试真实池子的数据收集...")
    try {
      const collectResponse = await axios.post(
        `${API_BASE_URL}/pools-v4/${calculatedPoolId}/collect`
      )
      console.log("✅ 数据收集触发成功")
      console.log("响应:", collectResponse.data)
    } catch (error) {
      console.log(
        "⚠️ 数据收集失败（可能是正常的）:",
        error.response?.data?.message || error.message
      )
    }

    // 5. 检查是否有流动性数据
    console.log("\n5. 检查流动性数据...")
    try {
      const liquidityResponse = await axios.get(
        `${API_BASE_URL}/liquidity-v4/pool/${calculatedPoolId}?limit=5`
      )
      console.log(`✅ 获取到 ${liquidityResponse.data.total} 条流动性数据`)
      if (liquidityResponse.data.total > 0) {
        console.log(
          "前5条数据的 tick 范围:",
          liquidityResponse.data.data.map((d) => d.tick).slice(0, 5)
        )
      }
    } catch (error) {
      console.log("⚠️ 暂无流动性数据")
    }
  } catch (error) {
    console.error("❌ 测试失败:", error.response?.data || error.message)
  }
}

testRealPoolId().catch(console.error)
