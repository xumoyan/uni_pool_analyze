import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from "typeorm";
import { TickLiquidity } from "./tick-liquidity.entity";

@Entity("pools_v4")
@Index("idx_pools_v4_pool_id", ["poolId"])
@Index("idx_pools_v4_tokens_fee", ["token0Address", "token1Address", "feeTier"])
export class PoolV4 {
  @PrimaryGeneratedColumn()
  id: number;

  // V4 特有字段：PoolId (bytes32 哈希值)
  @Column({ name: "pool_id", unique: true, length: 66 }) // 0x + 64 hex chars
  poolId: string;

  // 原有字段保持兼容
  @Column({ name: "token0_address" })
  token0Address: string;

  @Column({ name: "token1_address" })
  token1Address: string;

  @Column({ name: "token0_symbol" })
  token0Symbol: string;

  @Column({ name: "token1_symbol" })
  token1Symbol: string;

  @Column({ name: "token0_decimals" })
  token0Decimals: number;

  @Column({ name: "token1_decimals" })
  token1Decimals: number;

  @Column({ name: "fee_tier" })
  feeTier: number;

  @Column({ name: "tick_spacing" })
  tickSpacing: number;

  // V4 特有字段：Hooks 合约地址
  @Column({ name: "hooks_address", nullable: true })
  hooksAddress: string;

  // PoolManager 合约地址 (V4 中所有池子共享同一个)
  @Column({ name: "pool_manager_address" })
  poolManagerAddress: string;

  // 池子状态信息
  @Column({ name: "current_sqrt_price_x96", type: "decimal", precision: 65, scale: 0, nullable: true })
  currentSqrtPriceX96: string;

  @Column({ name: "current_tick", nullable: true })
  currentTick: number;

  @Column({ name: "total_liquidity", type: "decimal", precision: 65, scale: 0, nullable: true })
  totalLiquidity: string;

  @Column({ name: "total_amount0", type: "decimal", precision: 65, scale: 0, nullable: true })
  totalAmount0: string;

  @Column({ name: "total_amount1", type: "decimal", precision: 65, scale: 0, nullable: true })
  totalAmount1: string;

  @Column({ name: "is_active", default: true })
  isActive: boolean;

  // 版本标识
  @Column({ default: "v4" })
  version: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @OneToMany(() => TickLiquidity, (tickLiquidity) => tickLiquidity.poolV4)
  tickLiquidities: TickLiquidity[];

  @Column({ name: "chain_id" })
  chainId: number;

  // PoolKey 的 JSON 表示（用于调试和查询）
  @Column({ name: "pool_key", type: "jsonb", nullable: true })
  poolKey: {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
  };
}
