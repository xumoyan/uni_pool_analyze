const axios = require("axios")

const API_BASE_URL = "http://localhost:3001"

// 真正的Uniswap V3主网池子
const REAL_POOLS = [
  {
    token0Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    token1Address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    feeTier: 3000 // 0.3%
  },
  {
    token0Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    token1Address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    feeTier: 500 // 0.05%
  },
  {
    token0Address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
    token1Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    feeTier: 3000 // 0.3%
  },
  {
    token0Address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    token1Address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    feeTier: 3000 // 0.3%
  },
  {
    token0Address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    token1Address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    feeTier: 100 // 0.01%
  }
]

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

async function addRealPools() {
  console.log("🚀 开始添加真正的Uniswap V3主网池子...")
  
  for (let i = 0; i < REAL_POOLS.length; i++) {
    const pool = REAL_POOLS[i]
    console.log(`\n📋 [${i + 1}/${REAL_POOLS.length}] 添加池子:`)
    console.log(`   Token0: ${pool.token0Address}`)
    console.log(`   Token1: ${pool.token1Address}`)
    console.log(`   费率: ${pool.feeTier / 10000}%`)
    
    try {
      const response = await api.post("/pools", pool)
      
      if (response.data) {
        console.log(`   ✅ 成功添加池子: ${response.data.token0Symbol}-${response.data.token1Symbol}`)
        console.log(`   📍 地址: ${response.data.address}`)
      }
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.message?.includes("already exists")) {
        console.log(`   ⚠️  池子已存在`)
      } else {
        console.log(`   ❌ 添加失败: ${error.response?.data?.message || error.message}`)
      }
    }
    
    // 延迟一下避免请求过快
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.log("\n🎉 真实池子添加完成！")
  console.log("\n💡 接下来可以:")
  console.log("1. 运行 node collect-historical-background.js 收集历史数据")
  console.log("2. 访问 http://localhost:3000/revenue 查看收益图表")
}

if (require.main === module) {
  addRealPools()
}

module.exports = { addRealPools }
