const axios = require("axios")
const fs = require("fs")
const path = require("path")

// 配置API基础URL
const API_BASE_URL = "http://localhost:3001"
const PROGRESS_FILE = path.join(__dirname, "collection-progress.json")

// 创建axios实例，超时时间设置为30分钟
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 1800000, // 30分钟超时
})

// 保存进度
function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

// 读取进度
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"))
    }
  } catch (error) {
    console.log("无法读取进度文件，从头开始")
  }
  return { completedPools: [], startTime: new Date().toISOString() }
}

// 记录日志到文件
function logToFile(message) {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}\n`

  console.log(message)
  fs.appendFileSync("collection.log", logMessage)
}

async function collectHistoricalDataWithProgress() {
  try {
    logToFile("🚀 开始收集所有池子的历史数据（后台模式）...")

    // 读取之前的进度
    const progress = loadProgress()
    logToFile(
      `📋 从进度文件恢复，已完成 ${progress.completedPools.length} 个池子`
    )

    // 1. 获取所有池子
    logToFile("📋 获取池子列表...")
    const poolsResponse = await api.get("/pools")

    let pools = []
    if (Array.isArray(poolsResponse.data)) {
      pools = poolsResponse.data
    } else if (poolsResponse.data.success && poolsResponse.data.data) {
      pools = poolsResponse.data.data
    } else if (
      poolsResponse.data.data &&
      Array.isArray(poolsResponse.data.data)
    ) {
      pools = poolsResponse.data.data
    } else {
      throw new Error("获取池子列表失败")
    }

    logToFile(`✅ 找到 ${pools.length} 个池子`)

    // 过滤出尚未完成的池子
    const remainingPools = pools.filter(
      (pool) => !progress.completedPools.includes(pool.address)
    )
    logToFile(`🔄 剩余需要处理的池子: ${remainingPools.length} 个`)

    if (remainingPools.length === 0) {
      logToFile("🎉 所有池子都已完成收集！")
      return
    }

    // 2. 为每个剩余的池子收集历史数据
    for (let i = 0; i < remainingPools.length; i++) {
      const pool = remainingPools[i]
      const totalProgress = progress.completedPools.length + i + 1

      logToFile(
        `\n🔄 [${totalProgress}/${pools.length}] 开始收集池子 ${pool.token0Symbol}-${pool.token1Symbol} 的历史数据...`
      )
      logToFile(`   地址: ${pool.address}`)
      logToFile(`   剩余: ${remainingPools.length - i - 1} 个池子`)

      const startTime = new Date()

      try {
        // 调用历史数据同步API
        const response = await api.post(
          "/revenue/sync-historical",
          {},
          {
            params: {
              poolAddress: pool.address,
              blockInterval: 7200, // 每天约7200个块
            },
          }
        )

        const endTime = new Date()
        const duration = Math.round((endTime - startTime) / 1000)

        if (response.data.success) {
          logToFile(
            `   ✅ 成功同步 ${response.data.data.syncedRecords} 条记录 (耗时: ${duration}秒)`
          )
        } else {
          logToFile(`   ❌ 同步失败: ${response.data.message}`)
        }

        // 更新进度
        progress.completedPools.push(pool.address)
        progress.lastCompleted = {
          address: pool.address,
          symbol: `${pool.token0Symbol}-${pool.token1Symbol}`,
          time: new Date().toISOString(),
          duration: duration,
        }
        saveProgress(progress)

        // 计算预估剩余时间
        const avgTimePerPool = duration
        const remainingTime = Math.round(
          ((remainingPools.length - i - 1) * avgTimePerPool) / 60
        )
        if (remainingTime > 0) {
          logToFile(`   ⏰ 预估剩余时间: ${remainingTime} 分钟`)
        }
      } catch (error) {
        const endTime = new Date()
        const duration = Math.round((endTime - startTime) / 1000)

        logToFile(
          `   ❌ 收集失败 (耗时: ${duration}秒): ${
            error.response?.data?.message || error.message
          }`
        )

        // 如果是超时错误，继续下一个
        if (
          error.code === "ECONNABORTED" ||
          error.message.includes("timeout")
        ) {
          logToFile(`   ⏭️  超时错误，继续处理下一个池子`)
        }

        continue
      }

      // 每个池子之间稍微延迟
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    logToFile("\n🎉 所有池子的历史数据收集完成！")
    logToFile(`📊 总共处理了 ${pools.length} 个池子`)
    logToFile(`⏱️  开始时间: ${progress.startTime}`)
    logToFile(`⏱️  结束时间: ${new Date().toISOString()}`)

    // 清理进度文件
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE)
      logToFile("🧹 清理进度文件")
    }
  } catch (error) {
    logToFile(`❌ 收集历史数据失败: ${error.response?.data || error.message}`)
    logToFile("💾 进度已保存，可以稍后重新运行脚本继续")
    process.exit(1)
  }
}

// 处理中断信号，保存进度
process.on("SIGINT", () => {
  logToFile("\n⏹️  收到中断信号，进度已保存")
  process.exit(0)
})

process.on("SIGTERM", () => {
  logToFile("\n⏹️  收到终止信号，进度已保存")
  process.exit(0)
})

// 运行脚本
if (require.main === module) {
  collectHistoricalDataWithProgress()
}

module.exports = { collectHistoricalDataWithProgress }
