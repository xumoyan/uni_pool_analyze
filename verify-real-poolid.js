const { ethers } = require("ethers")

// 配置
const RPC_URL = "http://10.8.6.153:2700"
const POOL_MANAGER_ADDRESS = "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e"

// 真实的 PoolId（从链上日志获取）
const REAL_POOL_ID =
  "0x72331fcb696b0151904c03584b66dc8365bc63f8a144d89a773384e3a579ca73"

async function verifyRealPoolId() {
  console.log("🔍 验证真实 PoolId 是否存在于链上...")

  try {
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

    // 简化的 PoolManager ABI
    const poolManagerAbi = [
      "function getSlot0(bytes32 id) external view returns (uint160 sqrtPriceX96, int24 tick, uint8 protocolFee, uint24 lpFee)",
      "function getLiquidity(bytes32 id) external view returns (uint128 liquidity)",
    ]

    const poolManager = new ethers.Contract(
      POOL_MANAGER_ADDRESS,
      poolManagerAbi,
      provider
    )

    console.log(`📊 测试 PoolId: ${REAL_POOL_ID}`)
    console.log(`🔗 PoolManager 地址: ${POOL_MANAGER_ADDRESS}`)

    // 1. 测试 getSlot0
    try {
      console.log("\n1. 测试 getSlot0...")
      const slot0 = await poolManager.getSlot0(REAL_POOL_ID)
      console.log("✅ getSlot0 成功:")
      console.log(`   sqrtPriceX96: ${slot0[0].toString()}`)
      console.log(`   tick: ${slot0[1]}`)
      console.log(`   protocolFee: ${slot0[2]}`)
      console.log(`   lpFee: ${slot0[3]}`)
    } catch (error) {
      console.log("❌ getSlot0 失败:", error.message)
    }

    // 2. 测试 getLiquidity
    try {
      console.log("\n2. 测试 getLiquidity...")
      const liquidity = await poolManager.getLiquidity(REAL_POOL_ID)
      console.log("✅ getLiquidity 成功:")
      console.log(`   liquidity: ${liquidity.toString()}`)
    } catch (error) {
      console.log("❌ getLiquidity 失败:", error.message)
    }

    // 3. 测试我们计算的 PoolId
    console.log("\n3. 验证我们的 PoolId 计算...")

    // 根据链上日志重建 PoolKey
    const poolKey = {
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
      fee: 500,
      tickSpacing: 10,
      hooks: "0x0000000000000000000000000000000000000000",
    }

    // 使用 ethers 计算 PoolId
    const { keccak256, defaultAbiCoder } = ethers.utils
    const encodedData = defaultAbiCoder.encode(
      ["address", "address", "uint24", "int24", "address"],
      [
        poolKey.currency0,
        poolKey.currency1,
        poolKey.fee,
        poolKey.tickSpacing,
        poolKey.hooks,
      ]
    )
    const calculatedPoolId = keccak256(encodedData)

    console.log(`计算的 PoolId: ${calculatedPoolId}`)
    console.log(`真实的 PoolId:  ${REAL_POOL_ID}`)
    console.log(
      `是否匹配: ${
        calculatedPoolId.toLowerCase() === REAL_POOL_ID.toLowerCase()
          ? "✅"
          : "❌"
      }`
    )
  } catch (error) {
    console.error("❌ 验证失败:", error)
  }
}

verifyRealPoolId().catch(console.error)
