import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { Pool } from "./entities/pool.entity";
import { TickLiquidity } from "./entities/tick-liquidity.entity";
import { PoolController } from "./controllers/pool.controller";
import { LiquidityController } from "./controllers/liquidity.controller";
import { PoolManagerService } from "./services/pool-manager.service";
import { LiquidityCollectorService } from "./services/liquidity-collector.service";
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
        entities: [Pool, TickLiquidity],
        synchronize: true, // 开发环境使用，生产环境应该关闭
        logging: true,
      }),
    }),
    TypeOrmModule.forFeature([Pool, TickLiquidity]),
    ScheduleModule.forRoot(),
  ],
  controllers: [PoolController, LiquidityController],
  providers: [PoolManagerService, LiquidityCollectorService],
})
export class AppModule {}
