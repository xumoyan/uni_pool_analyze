import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Pool } from "./pool.entity";

@Entity("tick_liquidity_data")
export class TickLiquidity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "pool_address" })
  poolAddress: string;

  @Column()
  tick: number;

  @Column({ name: "price", type: "numeric", precision: 78, scale: 8 })
  price: number;

  @Column({ name: "liquidity_gross", type: "numeric", precision: 78, scale: 0 })
  liquidityGross: string;

  @Column({ name: "liquidity_net", type: "numeric", precision: 78, scale: 0 })
  liquidityNet: string;

  @Column({ name: "initialized", default: false })
  initialized: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;

  @Column({
    name: "eth_amount",
    type: "numeric",
    precision: 78,
    scale: 8,
    default: () => "0",
  })
  ethAmount: number;

  @Column({
    name: "usdt_amount",
    type: "numeric",
    precision: 78,
    scale: 8,
    default: () => "0",
  })
  usdtAmount: number;

  @Column({ name: "token0_amount", type: "text", default: () => "'0'" })
  token0Amount: string;

  @Column({ name: "token1_amount", type: "text", default: () => "'0'" })
  token1Amount: string;

  @Column({
    name: "token0_amount_formatted",
    type: "text",
    default: () => "'0'",
  })
  token0AmountFormatted: string;

  @Column({
    name: "token1_amount_formatted",
    type: "text",
    default: () => "'0'",
  })
  token1AmountFormatted: string;

  @Column({ name: "block_number", type: "integer", nullable: true })
  blockNumber: number | null;

  @Column({ name: "block_timestamp", type: "timestamp", nullable: true })
  blockTimestamp: Date | null;

  @ManyToOne(() => Pool, (pool) => pool.tickLiquidities)
  @JoinColumn({ name: "pool_address", referencedColumnName: "address" })
  pool: Pool;
}
