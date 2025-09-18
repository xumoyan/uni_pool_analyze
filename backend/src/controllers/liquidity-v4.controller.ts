import { Controller, Get, Query, Param } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TickLiquidity } from "../entities/tick-liquidity.entity";

@Controller("liquidity-v4")
export class LiquidityV4Controller {
  constructor(
    @InjectRepository(TickLiquidity)
    private tickLiquidityRepository: Repository<TickLiquidity>,
  ) { }

  @Get("pool/:poolId")
  async getPoolV4Liquidity(
    @Param("poolId") poolId: string,
    @Query("limit") limit = "1000",
    @Query("offset") offset = "0",
    @Query("block") block?: string,
  ) {
    // 获取该 V4 池最新区块号（如未指定 block）
    let selectedBlock: number | null = null;
    if (block) {
      selectedBlock = parseInt(block);
    } else {
      const latest = await this.tickLiquidityRepository
        .createQueryBuilder("tick")
        .select("MAX(tick.blockNumber)", "max_block")
        .where("tick.poolId = :poolId", { poolId })
        .andWhere("tick.version = :version", { version: "v4" })
        .getRawOne();
      selectedBlock = latest?.max_block ?? null;
    }

    const qb = this.tickLiquidityRepository
      .createQueryBuilder("tick")
      .where("tick.poolId = :poolId", { poolId })
      .andWhere("tick.version = :version", { version: "v4" });

    if (selectedBlock !== null) {
      qb.andWhere("tick.blockNumber = :block", { block: selectedBlock });
    }

    const [data, total] = await qb
      .orderBy("tick.tick", "ASC")
      .take(parseInt(limit))
      .skip(parseInt(offset))
      .getManyAndCount();

    return {
      data,
      total,
      block: selectedBlock,
      limit: parseInt(limit),
      offset: parseInt(offset),
    };
  }

  @Get("pool/:poolId/range")
  async getV4LiquidityInRange(
    @Param("poolId") poolId: string,
    @Query("tickLower") tickLower: string,
    @Query("tickUpper") tickUpper: string,
    @Query("block") block?: string,
  ) {
    // 选最新块
    let selectedBlock: number | null = null;
    if (block) {
      selectedBlock = parseInt(block);
    } else {
      const latest = await this.tickLiquidityRepository
        .createQueryBuilder("tick")
        .select("MAX(tick.blockNumber)", "max_block")
        .where("tick.poolId = :poolId", { poolId })
        .andWhere("tick.version = :version", { version: "v4" })
        .getRawOne();
      selectedBlock = latest?.max_block ?? null;
    }

    const qb = this.tickLiquidityRepository
      .createQueryBuilder("tick")
      .where("tick.poolId = :poolId", { poolId })
      .andWhere("tick.version = :version", { version: "v4" })
      .andWhere("tick.tick >= :lower", { lower: parseInt(tickLower) })
      .andWhere("tick.tick <= :upper", { upper: parseInt(tickUpper) })
      .orderBy("tick.tick", "ASC");

    if (selectedBlock !== null) {
      qb.andWhere("tick.blockNumber = :block", { block: selectedBlock });
    }

    const data = await qb.getMany();

    return {
      data,
      total: data.length,
      range: { tickLower: parseInt(tickLower), tickUpper: parseInt(tickUpper) },
      block: selectedBlock,
    };
  }

  @Get("pool/:poolId/stats")
  async getV4LiquidityStats(@Param("poolId") poolId: string) {
    // 选最新块
    const latest = await this.tickLiquidityRepository
      .createQueryBuilder("t")
      .select("MAX(t.blockNumber)", "max_block")
      .where("t.poolId = :poolId", { poolId })
      .andWhere("t.version = :version", { version: "v4" })
      .getRawOne();

    const selectedBlock = latest?.max_block ?? null;

    const qb = this.tickLiquidityRepository
      .createQueryBuilder("tick")
      .select([
        "COUNT(*) as total_ticks",
        "SUM(CAST(tick.liquidityGross AS DECIMAL)) as total_liquidity",
        "AVG(CAST(tick.liquidityGross AS DECIMAL)) as avg_liquidity",
        "MIN(tick.tick) as min_tick",
        "MAX(tick.tick) as max_tick",
        "MIN(tick.price) as min_price",
        "MAX(tick.price) as max_price",
      ])
      .where("tick.poolId = :poolId", { poolId })
      .andWhere("tick.version = :version", { version: "v4" });

    if (selectedBlock !== null) {
      qb.andWhere("tick.blockNumber = :block", { block: selectedBlock });
    }

    const stats = await qb.getRawOne();

    return stats;
  }

  @Get("pool/:poolId/distribution")
  async getV4LiquidityDistribution(
    @Param("poolId") poolId: string,
    @Query("bins") bins = "20",
    @Query("block") block?: string,
  ) {
    const numBins = parseInt(bins);

    // 选最新块
    let selectedBlock: number | null = null;
    if (block) {
      selectedBlock = parseInt(block);
    } else {
      const latest = await this.tickLiquidityRepository
        .createQueryBuilder("t")
        .select("MAX(t.blockNumber)", "max_block")
        .where("t.poolId = :poolId", { poolId })
        .andWhere("t.version = :version", { version: "v4" })
        .getRawOne();
      selectedBlock = latest?.max_block ?? null;
    }

    // 获取tick范围（按块过滤）
    const rangeQb = this.tickLiquidityRepository
      .createQueryBuilder("tick")
      .select(["MIN(tick.tick) as min_tick", "MAX(tick.tick) as max_tick"])
      .where("tick.poolId = :poolId", { poolId })
      .andWhere("tick.version = :version", { version: "v4" });
    if (selectedBlock !== null) {
      rangeQb.andWhere("tick.blockNumber = :block", { block: selectedBlock });
    }
    const range = await rangeQb.getRawOne();

    const minTick = range.min_tick;
    const maxTick = range.max_tick;
    const binSize = Math.ceil((maxTick - minTick) / numBins);

    const distributions = [];

    for (let i = 0; i < numBins; i++) {
      const binTickLower = minTick + i * binSize;
      const binTickUpper =
        i === numBins - 1 ? maxTick : minTick + (i + 1) * binSize;

      const binQb = this.tickLiquidityRepository
        .createQueryBuilder("tick")
        .select([
          "COUNT(*) as tick_count",
          "SUM(CAST(tick.liquidityGross AS DECIMAL)) as total_liquidity",
          "SUM(CAST(tick.token0Amount AS DECIMAL)) as total_token0",
          "SUM(CAST(tick.token1Amount AS DECIMAL)) as total_token1",
          "AVG(tick.price) as avg_price",
        ])
        .where("tick.poolId = :poolId", { poolId })
        .andWhere("tick.version = :version", { version: "v4" })
        .andWhere("tick.tick >= :lower", { lower: binTickLower })
        .andWhere("tick.tick < :upper", { upper: binTickUpper });
      if (selectedBlock !== null) {
        binQb.andWhere("tick.blockNumber = :block", { block: selectedBlock });
      }
      const binStats = await binQb.getRawOne();

      distributions.push({
        binIndex: i,
        tickLower: binTickLower,
        tickUpper: binTickUpper,
        tickCount: parseInt(binStats.tick_count) || 0,
        totalLiquidity: binStats.total_liquidity || "0",
        totalToken0: binStats.total_token0 || "0",
        totalToken1: binStats.total_token1 || "0",
        avgPrice: binStats.avg_price || 0,
      });
    }

    return {
      poolId,
      numBins,
      distributions,
      block: selectedBlock,
    };
  }
}
