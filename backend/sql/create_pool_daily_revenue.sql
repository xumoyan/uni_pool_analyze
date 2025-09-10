-- 池子日收益统计表
CREATE TABLE IF NOT EXISTS pool_daily_revenue (
    id SERIAL PRIMARY KEY,
    pool_address VARCHAR(42) NOT NULL,
    date DATE NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP NOT NULL,
    
    -- 当日累计收益（手续费收入）
    fee_revenue_token0 NUMERIC(78, 0) DEFAULT 0,
    fee_revenue_token1 NUMERIC(78, 0) DEFAULT 0,
    
    -- 当日累计收益格式化显示
    fee_revenue_token0_formatted TEXT DEFAULT '0',
    fee_revenue_token1_formatted TEXT DEFAULT '0',
    
    -- 当日流动性变化
    liquidity_change NUMERIC(78, 0) DEFAULT 0,
    total_liquidity NUMERIC(78, 0) DEFAULT 0,
    
    -- 当日价格信息
    price_at_start NUMERIC(78, 18) DEFAULT 0,
    price_at_end NUMERIC(78, 18) DEFAULT 0,
    price_change_percent NUMERIC(10, 4) DEFAULT 0,
    
    -- 当日交易量
    volume_token0 NUMERIC(78, 0) DEFAULT 0,
    volume_token1 NUMERIC(78, 0) DEFAULT 0,
    volume_token0_formatted TEXT DEFAULT '0',
    volume_token1_formatted TEXT DEFAULT '0',
    
    -- USD 价值（用于前端显示）
    fee_revenue_usd NUMERIC(20, 8) DEFAULT 0,
    volume_usd NUMERIC(20, 8) DEFAULT 0,
    
    -- 创建和更新时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 唯一约束：每个池子每天只有一条记录
    CONSTRAINT uk_pool_daily_revenue UNIQUE (pool_address, date)
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_pool_daily_revenue_pool_address ON pool_daily_revenue(pool_address);
CREATE INDEX IF NOT EXISTS idx_pool_daily_revenue_date ON pool_daily_revenue(date);
CREATE INDEX IF NOT EXISTS idx_pool_daily_revenue_block_number ON pool_daily_revenue(block_number);
CREATE INDEX IF NOT EXISTS idx_pool_daily_revenue_pool_date ON pool_daily_revenue(pool_address, date);

-- 添加外键约束（如果需要的话）
-- ALTER TABLE pool_daily_revenue 
-- ADD CONSTRAINT fk_pool_daily_revenue_pool 
-- FOREIGN KEY (pool_address) REFERENCES pools(address) ON DELETE CASCADE;

-- 添加注释
COMMENT ON TABLE pool_daily_revenue IS '池子日收益统计表';
COMMENT ON COLUMN pool_daily_revenue.pool_address IS '池子地址';
COMMENT ON COLUMN pool_daily_revenue.date IS '统计日期';
COMMENT ON COLUMN pool_daily_revenue.block_number IS '当日最后一个区块号';
COMMENT ON COLUMN pool_daily_revenue.block_timestamp IS '当日最后一个区块时间戳';
COMMENT ON COLUMN pool_daily_revenue.fee_revenue_token0 IS 'Token0手续费收入（原始数值）';
COMMENT ON COLUMN pool_daily_revenue.fee_revenue_token1 IS 'Token1手续费收入（原始数值）';
COMMENT ON COLUMN pool_daily_revenue.fee_revenue_token0_formatted IS 'Token0手续费收入（格式化显示）';
COMMENT ON COLUMN pool_daily_revenue.fee_revenue_token1_formatted IS 'Token1手续费收入（格式化显示）';
COMMENT ON COLUMN pool_daily_revenue.liquidity_change IS '当日流动性变化量';
COMMENT ON COLUMN pool_daily_revenue.total_liquidity IS '当日结束时总流动性';
COMMENT ON COLUMN pool_daily_revenue.price_at_start IS '当日开始价格';
COMMENT ON COLUMN pool_daily_revenue.price_at_end IS '当日结束价格';
COMMENT ON COLUMN pool_daily_revenue.price_change_percent IS '当日价格变化百分比';
COMMENT ON COLUMN pool_daily_revenue.volume_token0 IS '当日Token0交易量';
COMMENT ON COLUMN pool_daily_revenue.volume_token1 IS '当日Token1交易量';
COMMENT ON COLUMN pool_daily_revenue.fee_revenue_usd IS '手续费收入USD价值';
COMMENT ON COLUMN pool_daily_revenue.volume_usd IS '交易量USD价值';
