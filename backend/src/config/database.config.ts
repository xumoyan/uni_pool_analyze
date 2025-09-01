import { registerAs } from "@nestjs/config";

export default registerAs("database", () => ({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "123456",
  database: process.env.DB_NAME || "uniswap_v3_analyzer",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  synchronize: true, // 开发环境使用，生产环境应该关闭
  logging: true,
}));
