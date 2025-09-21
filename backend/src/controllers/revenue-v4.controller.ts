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
import { PoolV4RevenueCollectorService } from "../services/pool-v4-revenue-collector.service";
import { PoolV4 } from "../entities/pool-v4.entity";

@Controller("revenue-v4")
export class RevenueV4Controller {
  private readonly logger = new Logger(RevenueV4Controller.name);

  constructor(
    private readonly poolV4RevenueCollectorService: PoolV4RevenueCollectorService,
    @InjectRepository(PoolV4)
    private poolV4Repository: Repository<PoolV4>,
  ) { }

  /**
   * 手动触发收集指定 V4 池子的每日收益数据
   */
  @Post("collect/:poolId")
  async collectPoolV4Revenue(
    @Param("poolId") poolId: string,
    @Query("date") date?: string,
  ) {
    try {
      this.logger.log(`手动收集 V4 池子 ${poolId} 的收益数据`);

      const result = await this.poolV4RevenueCollectorService.collectPoolDailyRevenue(
        poolId,
        date,
      );

      return {
        success: true,
        message: "V4 收益数据收集成功",
        data: result,
      };
    } catch (error) {
      this.logger.error("收集 V4 收益数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "收集 V4 收益数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取 V4 池子的收益历史数据
   */
  @Get("history/:poolId")
  async getPoolV4RevenueHistory(
    @Param("poolId") poolId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("limit") limit?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit) : 100;

      const result = await this.poolV4RevenueCollectorService.getPoolV4RevenueHistory(
        poolId,
        startDate,
        endDate,
        limitNum,
      );

      return {
        success: true,
        message: "获取 V4 收益历史数据成功",
        ...result,
      };
    } catch (error) {
      this.logger.error("获取 V4 收益历史数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "获取 V4 收益历史数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取所有 V4 池子的最新收益数据
   */
  @Get("latest-all")
  async getAllV4PoolsLatestRevenue() {
    try {
      const results = await this.poolV4RevenueCollectorService.getAllV4PoolsLatestRevenue();

      return {
        success: true,
        message: "获取所有 V4 池子最新收益数据成功",
        data: results,
        total: results.length,
      };
    } catch (error) {
      this.logger.error("获取所有 V4 池子最新收益数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "获取所有 V4 池子最新收益数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取多个 V4 池子的收益历史数据（用于前端图表）
   */
  @Get("chart-data")
  async getV4RevenueChartData(
    @Query("poolIds") poolIds?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("limit") limit?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit) : 100;
      const poolIdList = poolIds ? poolIds.split(",") : [];

      if (poolIdList.length === 0) {
        throw new HttpException(
          "请至少指定一个 V4 池子 ID",
          HttpStatus.BAD_REQUEST,
        );
      }

      const chartData = [];

      for (const poolId of poolIdList) {
        const result = await this.poolV4RevenueCollectorService.getPoolV4RevenueHistory(
          poolId.trim(),
          startDate,
          endDate,
          limitNum,
        );

        if (result.data.length > 0) {
          // 获取池子信息
          let poolInfo = null;
          try {
            poolInfo = await this.poolV4Repository.findOne({
              where: { poolId: poolId.trim() }
            });
          } catch (error) {
            this.logger.warn(`无法获取 V4 池子信息: ${poolId}`, error);
          }

          chartData.push({
            poolId: poolId.trim(),
            pool: poolInfo,
            data: result.data.reverse(), // 按时间正序排列
          });
        }
      }

      return {
        success: true,
        message: "获取 V4 图表数据成功",
        data: chartData,
      };
    } catch (error) {
      this.logger.error("获取 V4 图表数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "获取 V4 图表数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 手动触发所有 V4 池子的收益数据收集
   */
  @Post("collect-all")
  async collectAllV4PoolsRevenue(@Query("date") date?: string) {
    try {
      this.logger.log("手动触发所有 V4 池子的收益数据收集");

      // 调用收集服务
      this.poolV4RevenueCollectorService.collectV4DailyRevenue();

      return {
        success: true,
        message: "所有 V4 池子收益数据收集已触发",
      };
    } catch (error) {
      this.logger.error("触发 V4 收益数据收集失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "触发 V4 收益数据收集失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 批量收集指定 V4 池子的历史收益数据
   */
  @Post("collect-historical/:poolId")
  async collectPoolV4HistoricalRevenue(
    @Param("poolId") poolId: string,
    @Query("days") days?: string,
  ) {
    try {
      const daysNum = days ? parseInt(days) : 30;
      this.logger.log(`手动收集 V4 池子 ${poolId} 过去 ${daysNum} 天的历史收益数据`);

      const result = await this.poolV4RevenueCollectorService.collectPoolHistoricalRevenue(
        poolId,
        daysNum,
      );

      return {
        success: true,
        message: "V4 历史收益数据收集成功",
        data: result,
      };
    } catch (error) {
      this.logger.error("收集 V4 历史收益数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "收集 V4 历史收益数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 批量收集所有 V4 池子的历史收益数据
   */
  @Post("collect-all-historical")
  async collectAllV4PoolsHistoricalRevenue(@Query("days") days?: string) {
    try {
      const daysNum = days ? parseInt(days) : 30;
      this.logger.log(`手动触发所有 V4 池子过去 ${daysNum} 天的历史收益数据收集`);

      const result = await this.poolV4RevenueCollectorService.collectAllV4PoolsHistoricalRevenue(daysNum);

      return {
        success: true,
        message: "所有 V4 池子历史收益数据收集成功",
        data: result,
      };
    } catch (error) {
      this.logger.error("收集所有 V4 池子历史收益数据失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "收集所有 V4 池子历史收益数据失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 🧪 测试 V4 事件查询
   */
  @Post("test-events/:poolId")
  async testV4Events(@Param("poolId") poolId: string) {
    try {
      this.logger.log(`测试 V4 池子 ${poolId} 的事件查询`);

      await this.poolV4RevenueCollectorService.testV4EventQuery(poolId);

      return {
        success: true,
        message: "V4 事件查询测试完成，请查看日志",
      };
    } catch (error) {
      this.logger.error("V4 事件查询测试失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "V4 事件查询测试失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 🧪 测试 V4 收益计算
   */
  @Post("test-calculation/:poolId")
  async testV4RevenueCalculation(
    @Param("poolId") poolId: string,
    @Query("date") date?: string,
  ) {
    try {
      this.logger.log(`测试 V4 池子 ${poolId} 的收益计算`);

      const result = await this.poolV4RevenueCollectorService.testV4RevenueCalculation(poolId, date);

      return {
        success: true,
        message: "V4 收益计算测试完成",
        data: result,
      };
    } catch (error) {
      this.logger.error("V4 收益计算测试失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "V4 收益计算测试失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取 V4 收益数据统计信息
   */
  @Get("stats/:poolId")
  async getV4RevenueStats(@Param("poolId") poolId: string) {
    try {
      const result = await this.poolV4RevenueCollectorService.getPoolV4RevenueHistory(
        poolId,
        undefined,
        undefined,
        1000, // 获取更多数据用于统计
      );

      if (result.data.length === 0) {
        return {
          success: true,
          message: "暂无 V4 收益数据",
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
        message: "获取 V4 收益统计信息成功",
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
      this.logger.error("获取 V4 收益统计信息失败:", error);
      throw new HttpException(
        {
          success: false,
          message: "获取 V4 收益统计信息失败",
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
