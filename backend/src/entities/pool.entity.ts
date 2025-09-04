import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { TickLiquidity } from "./tick-liquidity.entity";

@Entity("pools")
export class Pool {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  address: string;

  @Column()
  token0Address: string;

  @Column()
  token1Address: string;

  @Column()
  token0Symbol: string;

  @Column()
  token1Symbol: string;

  @Column()
  token0Decimals: number;

  @Column()
  token1Decimals: number;

  @Column()
  feeTier: number;

  @Column()
  tickSpacing: number;

  @Column({ type: "decimal", precision: 65, scale: 0, nullable: true })
  currentSqrtPriceX96: string;

  @Column({ nullable: true })
  currentTick: number;

  @Column({ type: "decimal", precision: 65, scale: 0, nullable: true })
  totalLiquidity: string;

  @Column({ type: "decimal", precision: 65, scale: 0, nullable: true })
  totalAmount0: string;

  @Column({ type: "decimal", precision: 65, scale: 0, nullable: true })
  totalAmount1: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => TickLiquidity, (tickLiquidity) => tickLiquidity.pool)
  tickLiquidities: TickLiquidity[];

  @Column()
  chainId: number;
}
