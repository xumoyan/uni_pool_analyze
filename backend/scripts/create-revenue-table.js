const { Pool } = require("pg")
const fs = require("fs")
const path = require("path")

// 数据库连接配置
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
  database: process.env.DB_NAME || "uniswap_v3_analyzer",
}

async function createRevenueTable() {
  const pool = new Pool(dbConfig)

  try {
    console.log("连接到数据库...")

    // 读取SQL文件
    const sqlPath = path.join(__dirname, "../sql/create_pool_daily_revenue.sql")
    const sql = fs.readFileSync(sqlPath, "utf8")

    console.log("执行SQL脚本...")
    await pool.query(sql)

    console.log("✅ 池子日收益统计表创建成功！")

    // 验证表是否创建成功
    const result = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'pool_daily_revenue'
      ORDER BY ordinal_position;
    `)

    console.log("\n📋 表结构:")
    result.rows.forEach((row) => {
      console.log(
        `  ${row.column_name}: ${row.data_type} ${row.is_nullable === "NO" ? "NOT NULL" : ""}`
      )
    })
  } catch (error) {
    console.error("❌ 创建表失败:", error.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// 运行脚本
if (require.main === module) {
  createRevenueTable()
}

module.exports = { createRevenueTable }
