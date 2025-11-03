import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import {
  PoolV4ManagerService,
  CreatePoolV4Dto,
} from "../services/pool-v4-manager.service";
import { LiquidityV4CollectorService } from "../services/liquidity-v4-collector.service";

@Controller("pools-v4")
export class PoolV4Controller {
  constructor(
    private readonly poolV4ManagerService: PoolV4ManagerService,
    private readonly liquidityV4CollectorService: LiquidityV4CollectorService,
  ) { }

  @Post()
  async createPoolV4(@Body() createPoolDto: CreatePoolV4Dto) {
    return this.poolV4ManagerService.createPoolV4(createPoolDto);
  }

  @Get()
  async getAllPoolsV4() {
    try {
      console.log('V4 Controller: getAllPoolsV4 called');
      const result = await this.poolV4ManagerService.getAllPoolsV4();
      console.log('V4 Controller: getAllPoolsV4 success', result.length);
      return result;
    } catch (error) {
      console.error('V4 Controller: getAllPoolsV4 error', error);
      throw error;
    }
  }

  @Get(":poolId")
  async getPoolByPoolId(@Param("poolId") poolId: string) {
    try {
      return await this.poolV4ManagerService.getPoolByPoolId(poolId);
    } catch (error) {
      if (error.message === "Pool not found") {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Pool with poolId ${poolId} not found`,
            error: "Not Found",
          },
          HttpStatus.NOT_FOUND
        );
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || "Internal server error",
          error: "Internal Server Error",
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(":poolId/stats")
  async getPoolStats(@Param("poolId") poolId: string) {
    try {
      return await this.poolV4ManagerService.getPoolStats(poolId);
    } catch (error) {
      if (error.message === "Pool not found") {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Pool with poolId ${poolId} not found`,
            error: "Not Found",
          },
          HttpStatus.NOT_FOUND
        );
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || "Internal server error",
          error: "Internal Server Error",
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Put(":poolId/status")
  async updatePoolStatus(
    @Param("poolId") poolId: string,
    @Body("isActive") isActive: boolean,
  ) {
    try {
      return await this.poolV4ManagerService.updatePoolStatus(poolId, isActive);
    } catch (error) {
      if (error.message === "Pool not found") {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Pool with poolId ${poolId} not found`,
            error: "Not Found",
          },
          HttpStatus.NOT_FOUND
        );
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || "Internal server error",
          error: "Internal Server Error",
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(":poolId")
  async deletePool(@Param("poolId") poolId: string) {
    try {
      await this.poolV4ManagerService.deletePool(poolId);
      return { success: true, message: "Pool deleted successfully" };
    } catch (error) {
      if (error.message === "Pool not found") {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            message: `Pool with poolId ${poolId} not found`,
            error: "Not Found",
          },
          HttpStatus.NOT_FOUND
        );
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || "Internal server error",
          error: "Internal Server Error",
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post(":poolId/collect")
  async manualCollectV4(@Param("poolId") poolId: string) {
    return this.liquidityV4CollectorService.manualCollectV4(poolId);
  }

  /**
   * 获取池子所有 V4 tick 数据
   */
  @Get(':poolId/all-liquidity')
  async getAllPoolV4Liquidity(@Param('poolId') poolId: string) {
    return this.liquidityV4CollectorService.getAllPoolV4Liquidity(poolId);
  }

  /**
   * 根据 PoolKey 计算 PoolId
   */
  @Post("calculate-pool-id")
  async calculatePoolId(@Body() poolKey: {
    token0Address: string;
    token1Address: string;
    feeTier: number;
    tickSpacing: number;
    hooksAddress?: string;
    chainId: number;
  }) {
    const key = this.poolV4ManagerService.createPoolKey(
      poolKey.token0Address,
      poolKey.token1Address,
      poolKey.feeTier,
      poolKey.tickSpacing,
      poolKey.chainId,
      poolKey.hooksAddress
    );

    const poolId = this.poolV4ManagerService.calculatePoolId(key, poolKey.chainId);

    return {
      poolKey: key,
      poolId,
    };
  }

  /**
   * 根据代币和参数查找池子
   */
  @Get("find-by-tokens")
  async findPoolByTokens(
    @Query("token0Address") token0Address: string,
    @Query("token1Address") token1Address: string,
    @Query("feeTier") feeTier: string,
    @Query("tickSpacing") tickSpacing: string,
    @Query("chainId") chainId: string,
    @Query("hooksAddress") hooksAddress?: string,
  ) {
    const pool = await this.poolV4ManagerService.findPoolByTokensAndHooks(
      token0Address,
      token1Address,
      parseInt(feeTier),
      parseInt(tickSpacing),
      parseInt(chainId),
      hooksAddress
    );

    if (!pool) {
      return {
        found: false,
        message: "Pool not found",
      };
    }

    return {
      found: true,
      pool,
    };
  }
}
