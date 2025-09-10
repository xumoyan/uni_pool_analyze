const fs = require("fs")
const path = require("path")

const PROGRESS_FILE = path.join(__dirname, "collection-progress.json")
const LOG_FILE = path.join(__dirname, "collection.log")

function checkProgress() {
  console.clear()
  console.log("📊 历史数据收集进度监控")
  console.log("=" * 50)

  // 检查进度文件
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"))
      console.log(`✅ 已完成池子数量: ${progress.completedPools.length}`)
      console.log(`⏰ 开始时间: ${progress.startTime}`)

      if (progress.lastCompleted) {
        console.log(`🔄 最后完成: ${progress.lastCompleted.symbol}`)
        console.log(`⏱️  完成时间: ${progress.lastCompleted.time}`)
        console.log(`⚡ 处理耗时: ${progress.lastCompleted.duration}秒`)
      }
    } catch (error) {
      console.log("❌ 无法读取进度文件")
    }
  } else {
    console.log("📝 没有找到进度文件，可能收集已完成或尚未开始")
  }

  console.log("\n" + "=" * 50)

  // 显示最近的日志
  if (fs.existsSync(LOG_FILE)) {
    console.log("📋 最近的日志 (最后10行):")
    console.log("-" * 50)

    try {
      const logs = fs.readFileSync(LOG_FILE, "utf8").split("\n")
      const recentLogs = logs.slice(-10).filter((line) => line.trim())
      recentLogs.forEach((log) => console.log(log))
    } catch (error) {
      console.log("❌ 无法读取日志文件")
    }
  }

  console.log("\n💡 提示:")
  console.log("- 按 Ctrl+C 退出监控")
  console.log("- 每10秒自动刷新一次")
  console.log("- 查看完整日志: tail -f collection.log")
}

// 每10秒检查一次进度
setInterval(checkProgress, 10000)

// 立即显示一次
checkProgress()

console.log("\n🔄 监控已启动，每10秒刷新一次...")
