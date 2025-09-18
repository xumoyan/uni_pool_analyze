import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { Pool } from "./entities/pool.entity";
import { PoolV4 } from "./entities/pool-v4.entity";
import { TickLiquidity } from "./entities/tick-liquidity.entity";
import { PoolDailyRevenue } from "./entities/pool-daily-revenue.entity";
import { PoolController } from "./controllers/pool.controller";
import { PoolV4Controller } from "./controllers/pool-v4.controller";
import { LiquidityController } from "./controllers/liquidity.controller";
import { RevenueController } from "./controllers/revenue.controller";
import { RevenueV4Controller } from "./controllers/revenue-v4.controller";
import { LiquidityV4Controller } from "./controllers/liquidity-v4.controller";
import { PoolManagerService } from "./services/pool-manager.service";
import { PoolV4ManagerService } from "./services/pool-v4-manager.service";
import { LiquidityCollectorService } from "./services/liquidity-collector.service";
import { LiquidityV4CollectorService } from "./services/liquidity-v4-collector.service";
import { PoolRevenueCollectorService } from "./services/pool-revenue-collector.service";
import { PoolV4RevenueCollectorService } from "./services/pool-v4-revenue-collector.service";
import databaseConfig from "./config/database.config";
import ethereumConfig from "./config/ethereum.config";
import appConfig from "./config/configuration";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, ethereumConfig, appConfig],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: "postgres",
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        username: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "password",
        database: process.env.DB_NAME || "uniswap_v3_analyzer",
        ssl:
          process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
        entities: [Pool, PoolV4, TickLiquidity, PoolDailyRevenue],
        synchronize: false, // 开发环境使用，生产环境应该关闭
        logging: true,
      }),
    }),
    TypeOrmModule.forFeature([Pool, PoolV4, TickLiquidity, PoolDailyRevenue]),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    PoolController,
    PoolV4Controller,
    LiquidityController,
    LiquidityV4Controller,
    RevenueController,
    RevenueV4Controller
  ],
  providers: [
    PoolManagerService,
    PoolV4ManagerService,
    LiquidityCollectorService,
    LiquidityV4CollectorService,
    PoolRevenueCollectorService,
    PoolV4RevenueCollectorService
  ],
})
export class AppModule { }
