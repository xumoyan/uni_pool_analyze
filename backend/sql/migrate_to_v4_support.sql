-- ==========================================
-- Uniswap V4 支持数据库迁移脚本
-- ==========================================

-- 开始事务
BEGIN;

-- 1. 创建 V4 池子表
CREATE TABLE IF NOT EXISTS public.pools_v4 (
    id serial NOT NULL,
    pool_id character varying(66) NOT NULL, -- PoolId (0x + 64 hex chars)
    token0_address character varying(42) NOT NULL,
    token1_address character varying(42) NOT NULL,
    token0_symbol character varying(20) NOT NULL,
    token1_symbol character varying(20) NOT NULL,
    token0_decimals integer NOT NULL,
    token1_decimals integer NOT NULL,
    fee_tier integer NOT NULL,
    tick_spacing integer NOT NULL,
    hooks_address character varying(42) NULL,
    pool_manager_address character varying(42) NOT NULL,
    current_sqrt_price_x96 numeric(65, 0) NULL,
    current_tick integer NULL,
    total_liquidity numeric(65, 0) NULL,
    total_amount0 numeric(65, 0) NULL,
    total_amount1 numeric(65, 0) NULL,
    is_active boolean NOT NULL DEFAULT true,
    version character varying(10) NOT NULL DEFAULT 'v4',
    chain_id integer NOT NULL,
    pool_key jsonb NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT pools_v4_pkey PRIMARY KEY (id),
    CONSTRAINT pools_v4_pool_id_unique UNIQUE (pool_id)
);

-- 2. 为 pools_v4 创建索引
CREATE INDEX IF NOT EXISTS idx_pools_v4_pool_id ON public.pools_v4 (pool_id);
CREATE INDEX IF NOT EXISTS idx_pools_v4_tokens_fee ON public.pools_v4 (token0_address, token1_address, fee_tier);
CREATE INDEX IF NOT EXISTS idx_pools_v4_hooks ON public.pools_v4 (hooks_address);
CREATE INDEX IF NOT EXISTS idx_pools_v4_active ON public.pools_v4 (is_active);
CREATE INDEX IF NOT EXISTS idx_pools_v4_chain ON public.pools_v4 (chain_id);

-- 3. 修改 tick_liquidity_data 表
-- 添加新字段（如果不存在）
DO $$
BEGIN
    -- 添加 pool_id 字段
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tick_liquidity_data' 
                   AND column_name = 'pool_id') THEN
        ALTER TABLE public.tick_liquidity_data 
        ADD COLUMN pool_id character varying(66) NULL;
    END IF;
    
    -- 添加 version 字段
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tick_liquidity_data' 
                   AND column_name = 'version') THEN
        ALTER TABLE public.tick_liquidity_data 
        ADD COLUMN version character varying(10) NOT NULL DEFAULT 'v3';
    END IF;
END $$;

-- 4. 为 tick_liquidity_data 创建索引
CREATE INDEX IF NOT EXISTS idx_tick_liquidity_pool_id ON public.tick_liquidity_data (pool_id);
CREATE INDEX IF NOT EXISTS idx_tick_liquidity_version ON public.tick_liquidity_data (version);
CREATE INDEX IF NOT EXISTS idx_tick_liquidity_pool_id_tick ON public.tick_liquidity_data (pool_id, tick);
CREATE INDEX IF NOT EXISTS idx_tick_liquidity_pool_id_block ON public.tick_liquidity_data (pool_id, block_number);

-- 5. 修改 pool_daily_revenue 表
-- 添加 version 字段（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pool_daily_revenue' 
                   AND column_name = 'version') THEN
        ALTER TABLE public.pool_daily_revenue 
        ADD COLUMN version character varying(10) NOT NULL DEFAULT 'v3';
    END IF;
END $$;

-- 6. 为 pool_daily_revenue 创建索引
CREATE INDEX IF NOT EXISTS idx_pool_daily_revenue_version ON public.pool_daily_revenue (version);
CREATE INDEX IF NOT EXISTS idx_pool_daily_revenue_pool_version ON public.pool_daily_revenue (pool_address, version);

-- 7. 更新现有数据的版本标识
UPDATE public.tick_liquidity_data 
SET version = 'v3' 
WHERE version IS NULL OR version = '' OR version != 'v4';

UPDATE public.pool_daily_revenue 
SET version = 'v3' 
WHERE version IS NULL OR version = '' OR version != 'v4';

-- 8. 添加约束
-- tick_liquidity_data 约束
DO $$
BEGIN
    -- 版本检查约束
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'chk_tick_liquidity_version') THEN
        ALTER TABLE public.tick_liquidity_data 
        ADD CONSTRAINT chk_tick_liquidity_version 
        CHECK (version IN ('v3', 'v4'));
    END IF;
    
    -- 池子引用约束
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'chk_tick_liquidity_pool_reference') THEN
        ALTER TABLE public.tick_liquidity_data 
        ADD CONSTRAINT chk_tick_liquidity_pool_reference 
        CHECK (
            (version = 'v3' AND pool_address IS NOT NULL) OR
            (version = 'v4' AND pool_id IS NOT NULL)
        );
    END IF;
END $$;

-- pool_daily_revenue 约束
DO $$
BEGIN
    -- 版本检查约束
    IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints 
                   WHERE constraint_name = 'chk_pool_daily_revenue_version') THEN
        ALTER TABLE public.pool_daily_revenue 
        ADD CONSTRAINT chk_pool_daily_revenue_version 
        CHECK (version IN ('v3', 'v4'));
    END IF;
END $$;

-- 9. 更新唯一约束
-- 删除旧的唯一约束（如果存在）
ALTER TABLE public.pool_daily_revenue 
DROP CONSTRAINT IF EXISTS uk_pool_daily_revenue;

-- 添加新的唯一约束（包含版本字段）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'uk_pool_daily_revenue_v2') THEN
        ALTER TABLE public.pool_daily_revenue 
        ADD CONSTRAINT uk_pool_daily_revenue_v2 
        UNIQUE (pool_address, date, version);
    END IF;
END $$;

-- 10. 添加表和字段注释
COMMENT ON TABLE public.pools_v4 IS 'Uniswap V4 池子信息表';
COMMENT ON COLUMN public.pools_v4.pool_id IS 'V4 池子的唯一标识符 (PoolKey 的 keccak256 哈希)';
COMMENT ON COLUMN public.pools_v4.hooks_address IS 'V4 池子关联的 hooks 合约地址';
COMMENT ON COLUMN public.pools_v4.pool_manager_address IS 'V4 PoolManager 合约地址';
COMMENT ON COLUMN public.pools_v4.pool_key IS 'PoolKey 的 JSON 表示，用于调试和查询';

COMMENT ON COLUMN public.tick_liquidity_data.pool_id IS 'V4 池子的 PoolId，V3 池子此字段为 NULL';
COMMENT ON COLUMN public.tick_liquidity_data.version IS '版本标识：v3 或 v4';

COMMENT ON COLUMN public.pool_daily_revenue.version IS '版本标识：v3 或 v4';
COMMENT ON COLUMN public.pool_daily_revenue.pool_address IS 'V3 池子地址或 V4 PoolId';

-- 提交事务
COMMIT;

-- 显示迁移结果
SELECT 
    'pools_v4' as table_name,
    COUNT(*) as record_count
FROM public.pools_v4
UNION ALL
SELECT 
    'tick_liquidity_data (v3)' as table_name,
    COUNT(*) as record_count
FROM public.tick_liquidity_data 
WHERE version = 'v3'
UNION ALL
SELECT 
    'tick_liquidity_data (v4)' as table_name,
    COUNT(*) as record_count
FROM public.tick_liquidity_data 
WHERE version = 'v4'
UNION ALL
SELECT 
    'pool_daily_revenue (v3)' as table_name,
    COUNT(*) as record_count
FROM public.pool_daily_revenue 
WHERE version = 'v3'
UNION ALL
SELECT 
    'pool_daily_revenue (v4)' as table_name,
    COUNT(*) as record_count
FROM public.pool_daily_revenue 
WHERE version = 'v4';

PRINT 'V4 数据库迁移完成！';
