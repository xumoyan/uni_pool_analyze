import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PoolRevenueCollectorService } from "../services/pool-revenue-collector.service";
import { Pool } from "../entities/pool.entity";

export interface SyncHistoricalRevenueDto {
  poolAddress: string;
  startBlockNumber?: number;
  endBlockNumber?: number;
  blockInterval?: number;
}

export interface GetRevenueHistoryDto {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

@Controller("revenue")
export class RevenueController {
  private readonly logger = new Logger(RevenueController.name);

  constructor(
    private readonly poolRevenueCollectorService: PoolRevenueCollectorService,
    @InjectRepository(Pool)
    private poolRepository: Repository<Pool>,
  ) { }

  /**
   * 手动触发收集指定池子的每日收益数据
   */
  @Post("collect/:poolAddress")
  async collectPoolRevenue(
    @Param("poolAddress") poolAddress: string,
    @Query("date") date?: string,
  ) {
    try {
      this.logger.log(`手动收集池子 ${poolAddress} 的收益数据`);

      const result = await this.poolRevenueCollectorService.collectPoolDailyRevenue(
        poolAddress,
        date,
      );

      return {
        success: true,
        message: "收益数据收集成功",
        data: result,
      };
    } catch (error) {
      this.logger.error("收集收益数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "收集收益数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 批量同步历史收益数据
   */
  @Post("sync-historical")
  async syncHistoricalRevenue(
    @Query("poolAddress") poolAddress: string,
    @Query("startBlockNumber") startBlockNumber?: string,
    @Query("endBlockNumber") endBlockNumber?: string,
    @Query("blockInterval") blockInterval?: string,
  ) {
    try {
      if (!poolAddress) {
        throw new HttpException(
          "池子地址不能为空",
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`开始同步池子 ${poolAddress} 的历史收益数据`);

      const startBlock = startBlockNumber ? parseInt(startBlockNumber) : undefined;
      const endBlock = endBlockNumber ? parseInt(endBlockNumber) : undefined;
      const interval = blockInterval ? parseInt(blockInterval) : 7200;

      const results = await this.poolRevenueCollectorService.syncHistoricalRevenue(
        poolAddress,
        startBlock,
        endBlock,
        interval,
      );

      return {
        success: true,
        message: `历史收益数据同步成功，处理了 ${results.syncedMonths} 个月的数据`,
        data: {
          syncedRecords: results.syncedMonths,
          syncedMonths: results.syncedMonths,
          details: results.details,
        },
      };
    } catch (error) {
      this.logger.error("同步历史收益数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "同步历史收益数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取池子的收益历史数据
   */
  @Get("history/:poolAddress")
  async getPoolRevenueHistory(
    @Param("poolAddress") poolAddress: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("limit") limit?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit) : 100;

      const result = await this.poolRevenueCollectorService.getPoolRevenueHistory(
        poolAddress,
        startDate,
        endDate,
        limitNum,
      );

      return {
        success: true,
        message: "获取收益历史数据成功",
        ...result,
      };
    } catch (error) {
      this.logger.error("获取收益历史数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "获取收益历史数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取所有池子的最新收益数据
   */
  @Get("latest-all")
  async getAllPoolsLatestRevenue() {
    try {
      const results = await this.poolRevenueCollectorService.getAllPoolsLatestRevenue();

      return {
        success: true,
        message: "获取所有池子最新收益数据成功",
        data: results,
        total: results.length,
      };
    } catch (error) {
      this.logger.error("获取所有池子最新收益数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "获取所有池子最新收益数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取多个池子的收益历史数据（用于前端图表）
   */
  @Get("chart-data")
  async getRevenueChartData(
    @Query("poolAddresses") poolAddresses?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("limit") limit?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit) : 100;
      const addresses = poolAddresses ? poolAddresses.split(",") : [];

      if (addresses.length === 0) {
        throw new HttpException(
          "请至少指定一个池子地址",
          HttpStatus.BAD_REQUEST,
        );
      }

      const chartData = [];

      for (const poolAddress of addresses) {
        const result = await this.poolRevenueCollectorService.getPoolRevenueHistory(
          poolAddress.trim(),
          startDate,
          endDate,
          limitNum,
        );

        if (result.data.length > 0) {
          // 获取池子信息，如果关联查询失败则手动查询
          let poolInfo = result.data[0].pool;
          if (!poolInfo) {
            try {
              poolInfo = await this.poolRepository.findOne({
                where: { address: poolAddress.trim() }
              });
            } catch (error) {
              this.logger.warn(`无法获取池子信息: ${poolAddress}`, error);
            }
          }

          chartData.push({
            poolAddress: poolAddress.trim(),
            pool: poolInfo,
            data: result.data.reverse(), // 按时间正序排列
          });
        }
      }

      return {
        success: true,
        message: "获取图表数据成功",
        data: chartData,
      };
    } catch (error) {
      this.logger.error("获取图表数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "获取图表数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 手动触发所有池子的收益数据收集
   */
  @Post("collect-all")
  async collectAllPoolsRevenue(@Query("date") date?: string) {
    try {
      this.logger.log("手动触发所有池子的最新收益数据收集");

      // 调用新的收集最新数据方法
      await this.poolRevenueCollectorService.collectLatestRevenueData();

      return {
        success: true,
        message: "所有池子最新收益数据收集完成",
      };
    } catch (error) {
      this.logger.error("触发收益数据收集失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "触发收益数据收集失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取收益数据统计信息
   */
  @Get("stats/:poolAddress")
  async getRevenueStats(@Param("poolAddress") poolAddress: string) {
    try {
      const result = await this.poolRevenueCollectorService.getPoolRevenueHistory(
        poolAddress,
        undefined,
        undefined,
        1000, // 获取更多数据用于统计
      );

      if (result.data.length === 0) {
        return {
          success: true,
          message: "暂无收益数据",
          data: {
            totalDays: 0,
            totalFeeRevenueUsd: 0,
            totalVolumeUsd: 0,
            avgDailyRevenueUsd: 0,
            avgDailyVolumeUsd: 0,
          },
        };
      }

      // 计算统计信息
      const totalDays = result.data.length;
      const totalFeeRevenueUsd = result.data.reduce(
        (sum, item) => sum + parseFloat(item.feeRevenueUsd),
        0,
      );
      const totalVolumeUsd = result.data.reduce(
        (sum, item) => sum + parseFloat(item.volumeUsd),
        0,
      );
      const avgDailyRevenueUsd = totalFeeRevenueUsd / totalDays;
      const avgDailyVolumeUsd = totalVolumeUsd / totalDays;

      return {
        success: true,
        message: "获取收益统计信息成功",
        data: {
          totalDays,
          totalFeeRevenueUsd: totalFeeRevenueUsd.toFixed(2),
          totalVolumeUsd: totalVolumeUsd.toFixed(2),
          avgDailyRevenueUsd: avgDailyRevenueUsd.toFixed(2),
          avgDailyVolumeUsd: avgDailyVolumeUsd.toFixed(2),
          firstRecordDate: result.data[result.data.length - 1].date,
          lastRecordDate: result.data[0].date,
        },
      };
    } catch (error) {
      this.logger.error("获取收益统计信息失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "获取收益统计信息失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
