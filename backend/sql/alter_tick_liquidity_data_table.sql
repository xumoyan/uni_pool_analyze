-- 为 tick_liquidity_data 表添加 V4 支持字段
ALTER TABLE public.tick_liquidity_data 
ADD COLUMN pool_id character varying(66) NULL,
ADD COLUMN version character varying(10) NOT NULL DEFAULT 'v3';

-- 创建索引
CREATE INDEX idx_tick_liquidity_pool_id ON public.tick_liquidity_data (pool_id);
CREATE INDEX idx_tick_liquidity_version ON public.tick_liquidity_data (version);
CREATE INDEX idx_tick_liquidity_pool_id_tick ON public.tick_liquidity_data (pool_id, tick);
CREATE INDEX idx_tick_liquidity_pool_id_block ON public.tick_liquidity_data (pool_id, block_number);

-- 添加注释
COMMENT ON COLUMN public.tick_liquidity_data.pool_id IS 'V4 池子的 PoolId，V3 池子此字段为 NULL';
COMMENT ON COLUMN public.tick_liquidity_data.version IS '版本标识：v3 或 v4';

-- 为现有数据设置版本标识（所有现有数据都是 V3）
UPDATE public.tick_liquidity_data 
SET version = 'v3' 
WHERE version IS NULL OR version = '';

-- 添加检查约束
ALTER TABLE public.tick_liquidity_data 
ADD CONSTRAINT chk_tick_liquidity_version 
CHECK (version IN ('v3', 'v4'));

-- 添加逻辑约束：V3 数据必须有 pool_address，V4 数据必须有 pool_id
ALTER TABLE public.tick_liquidity_data 
ADD CONSTRAINT chk_tick_liquidity_pool_reference 
CHECK (
    (version = 'v3' AND pool_address IS NOT NULL AND pool_id IS NULL) OR
    (version = 'v4' AND pool_id IS NOT NULL)
);
