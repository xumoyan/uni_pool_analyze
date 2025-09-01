import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: parseInt(process.env.PORT, 10) || 3001,
  scanInterval: parseInt(process.env.SCAN_INTERVAL, 10) || 60000,
  maxTicksPerScan: parseInt(process.env.MAX_TICKS_PER_SCAN, 10) || 10000,
}));
