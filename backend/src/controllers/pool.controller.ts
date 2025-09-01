import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
} from "@nestjs/common";
import {
  PoolManagerService,
  CreatePoolDto,
} from "../services/pool-manager.service";
import { LiquidityCollectorService } from "../services/liquidity-collector.service";

@Controller("pools")
export class PoolController {
  /**
   * 获取池子所有 tick 数据（转发到 LiquidityController）
   */
  @Get(':address/all-liquidity')
  async getAllPoolLiquidity(@Param('address') address: string) {
    return this.liquidityCollectorService.getAllPoolLiquidity(address);
  }
  constructor(
    private readonly poolManagerService: PoolManagerService,
    private readonly liquidityCollectorService: LiquidityCollectorService,
  ) { }

  @Post()
  async createPool(@Body() createPoolDto: CreatePoolDto) {
    return this.poolManagerService.createPool(createPoolDto);
  }

  @Get()
  async getAllPools() {
    return this.poolManagerService.getAllPools();
  }

  @Get(":address")
  async getPoolByAddress(@Param("address") address: string) {
    return this.poolManagerService.getPoolByAddress(address);
  }

  @Get(":address/stats")
  async getPoolStats(@Param("address") address: string) {
    return this.poolManagerService.getPoolStats(address);
  }

  @Put(":address/status")
  async updatePoolStatus(
    @Param("address") address: string,
    @Body("isActive") isActive: boolean,
  ) {
    return this.poolManagerService.updatePoolStatus(address, isActive);
  }

  @Delete(":address")
  async deletePool(@Param("address") address: string) {
    return this.poolManagerService.deletePool(address);
  }

  @Post(":address/collect")
  async manualCollect(@Param("address") address: string) {
    return this.liquidityCollectorService.manualCollect(address);
  }
}
