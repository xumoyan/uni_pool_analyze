import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from "typeorm";
import { Pool } from "./pool.entity";

@Entity("pool_daily_revenue")
@Unique("uk_pool_daily_revenue", ["poolAddress", "date"])
@Index("idx_pool_daily_revenue_pool_address", ["poolAddress"])
@Index("idx_pool_daily_revenue_date", ["date"])
@Index("idx_pool_daily_revenue_block_number", ["blockNumber"])
@Index("idx_pool_daily_revenue_pool_date", ["poolAddress", "date"])
export class PoolDailyRevenue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "pool_address", length: 42 })
  poolAddress: string;

  @Column({ name: "date", type: "date" })
  date: string;

  @Column({ name: "block_number", type: "bigint" })
  blockNumber: string;

  @Column({ name: "block_timestamp", type: "timestamp" })
  blockTimestamp: Date;

  // 当日累计收益（手续费收入）
  @Column({
    name: "fee_revenue_token0",
    type: "numeric",
    precision: 78,
    scale: 0,
    default: "0"
  })
  feeRevenueToken0: string;

  @Column({
    name: "fee_revenue_token1",
    type: "numeric",
    precision: 78,
    scale: 0,
    default: "0"
  })
  feeRevenueToken1: string;

  // 当日累计收益格式化显示
  @Column({ name: "fee_revenue_token0_formatted", type: "text", default: "0" })
  feeRevenueToken0Formatted: string;

  @Column({ name: "fee_revenue_token1_formatted", type: "text", default: "0" })
  feeRevenueToken1Formatted: string;

  // 当日流动性变化
  @Column({
    name: "liquidity_change",
    type: "numeric",
    precision: 78,
    scale: 0,
    default: "0"
  })
  liquidityChange: string;

  @Column({
    name: "total_liquidity",
    type: "numeric",
    precision: 78,
    scale: 0,
    default: "0"
  })
  totalLiquidity: string;

  // 当日价格信息
  @Column({
    name: "price_at_start",
    type: "numeric",
    precision: 78,
    scale: 18,
    default: "0"
  })
  priceAtStart: string;

  @Column({
    name: "price_at_end",
    type: "numeric",
    precision: 78,
    scale: 18,
    default: "0"
  })
  priceAtEnd: string;

  @Column({
    name: "price_change_percent",
    type: "numeric",
    precision: 10,
    scale: 4,
    default: "0"
  })
  priceChangePercent: string;

  // 当日交易量
  @Column({
    name: "volume_token0",
    type: "numeric",
    precision: 78,
    scale: 0,
    default: "0"
  })
  volumeToken0: string;

  @Column({
    name: "volume_token1",
    type: "numeric",
    precision: 78,
    scale: 0,
    default: "0"
  })
  volumeToken1: string;

  @Column({ name: "volume_token0_formatted", type: "text", default: "0" })
  volumeToken0Formatted: string;

  @Column({ name: "volume_token1_formatted", type: "text", default: "0" })
  volumeToken1Formatted: string;

  // USD 价值（用于前端显示）
  @Column({
    name: "fee_revenue_usd",
    type: "numeric",
    precision: 20,
    scale: 8,
    default: "0"
  })
  feeRevenueUsd: string;

  @Column({
    name: "volume_usd",
    type: "numeric",
    precision: 20,
    scale: 8,
    default: "0"
  })
  volumeUsd: string;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;

  // 关联到池子
  @ManyToOne(() => Pool, { eager: true })
  @JoinColumn({ name: "pool_address", referencedColumnName: "address" })
  pool: Pool;
}
