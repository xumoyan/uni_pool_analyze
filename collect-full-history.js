const axios = require("axios")
const fs = require("fs")
const path = require("path")

const API_BASE_URL = "http://localhost:3001"
const PROGRESS_FILE = path.join(__dirname, "full-history-progress.json")

// 创建axios实例，超时时间设置为1小时
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 3600000, // 1小时超时
})

// 记录日志
function logToFile(message) {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}\n`

  console.log(message)
  fs.appendFileSync("full-history.log", logMessage)
}

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
    logToFile("无法读取进度文件，从头开始")
  }
  return { completedPools: [], startTime: new Date().toISOString() }
}

async function collectFullHistoryData(startDate = "2023-01-01") {
  try {
    logToFile(`🚀 开始收集完整历史数据（从 ${startDate} 开始）...`)

    const progress = loadProgress()
    logToFile(
      `📋 从进度文件恢复，已完成 ${progress.completedPools.length} 个池子`
    )

    // 获取所有池子
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
    }

    logToFile(`✅ 找到 ${pools.length} 个池子`)

    const remainingPools = pools.filter(
      (pool) => !progress.completedPools.includes(pool.address)
    )
    logToFile(`🔄 剩余需要处理的池子: ${remainingPools.length} 个`)

    if (remainingPools.length === 0) {
      logToFile("🎉 所有池子都已完成收集！")
      return
    }

    // 计算大概的起始区块（2023年1月1日大约是区块16308190）
    const startBlockApprox = getApproximateBlockNumber(startDate)

    for (let i = 0; i < remainingPools.length; i++) {
      const pool = remainingPools[i]
      const totalProgress = progress.completedPools.length + i + 1

      logToFile(
        `\n🔄 [${totalProgress}/${pools.length}] 开始收集池子 ${pool.token0Symbol}-${pool.token1Symbol} 的完整历史数据...`
      )
      logToFile(`   地址: ${pool.address}`)
      logToFile(`   从日期: ${startDate} (预估区块: ${startBlockApprox})`)
      logToFile(`   剩余: ${remainingPools.length - i - 1} 个池子`)

      const startTime = new Date()

      try {
        // 先清除该池子的现有数据（可选）
        logToFile(`   🧹 准备收集完整历史数据...`)

        // 调用历史数据同步API，指定起始区块
        const response = await api.post(
          "/revenue/sync-historical",
          {},
          {
            params: {
              poolAddress: pool.address,
              startBlockNumber: startBlockApprox,
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

          // 获取统计信息
          try {
            const statsResponse = await api.get(
              `/revenue/stats/${pool.address}`
            )
            if (statsResponse.data.success) {
              const stats = statsResponse.data.data
              logToFile(
                `   📊 统计: ${stats.totalDays} 天数据，总收益 $${stats.totalFeeRevenueUsd}`
              )
            }
          } catch (error) {
            // 统计信息获取失败不影响主流程
          }
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
          recordsCount: response.data.success
            ? response.data.data.syncedRecords
            : 0,
        }
        saveProgress(progress)
      } catch (error) {
        const endTime = new Date()
        const duration = Math.round((endTime - startTime) / 1000)

        logToFile(
          `   ❌ 收集失败 (耗时: ${duration}秒): ${
            error.response?.data?.message || error.message
          }`
        )

        // 如果是超时，继续下一个
        if (
          error.code === "ECONNABORTED" ||
          error.message.includes("timeout")
        ) {
          logToFile(`   ⏭️  超时错误，继续处理下一个池子`)
        }

        continue
      }

      // 每个池子之间延迟5秒
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    logToFile("\n🎉 完整历史数据收集完成！")
    logToFile(`📊 总共处理了 ${pools.length} 个池子`)
    logToFile(`⏱️  开始时间: ${progress.startTime}`)
    logToFile(`⏱️  结束时间: ${new Date().toISOString()}`)

    // 清理进度文件
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE)
      logToFile("🧹 清理进度文件")
    }
  } catch (error) {
    logToFile(
      `❌ 收集完整历史数据失败: ${error.response?.data || error.message}`
    )
    logToFile("💾 进度已保存，可以稍后重新运行脚本继续")
    process.exit(1)
  }
}

// 根据日期估算区块号（粗略估算）
function getApproximateBlockNumber(dateString) {
  const date = new Date(dateString)
  const genesisDate = new Date("2015-07-30") // 以太坊创世块时间
  const avgBlockTime = 12 // 秒
  const blocksPerDay = (24 * 60 * 60) / avgBlockTime // 约7200

  const daysSinceGenesis = Math.floor(
    (date - genesisDate) / (24 * 60 * 60 * 1000)
  )
  return Math.floor(daysSinceGenesis * blocksPerDay)
}

// 处理命令行参数
const args = process.argv.slice(2)
const startDate = args[0] || "2023-01-01"

if (require.main === module) {
  logToFile(`📅 起始日期: ${startDate}`)
  logToFile(`💡 用法: node collect-full-history.js [起始日期]`)
  logToFile(`💡 例如: node collect-full-history.js 2022-01-01`)

  collectFullHistoryData(startDate)
}

module.exports = { collectFullHistoryData }
