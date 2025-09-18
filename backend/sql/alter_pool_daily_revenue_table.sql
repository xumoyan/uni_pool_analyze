-- 为 pool_daily_revenue 表添加版本支持（可选）
ALTER TABLE public.pool_daily_revenue 
ADD COLUMN version character varying(10) NOT NULL DEFAULT 'v3';

-- 创建索引
CREATE INDEX idx_pool_daily_revenue_version ON public.pool_daily_revenue (version);
CREATE INDEX idx_pool_daily_revenue_pool_version ON public.pool_daily_revenue (pool_address, version);

-- 添加注释
COMMENT ON COLUMN public.pool_daily_revenue.version IS '版本标识：v3 或 v4';
COMMENT ON COLUMN public.pool_daily_revenue.pool_address IS 'V3 池子地址或 V4 PoolId';

-- 为现有数据设置版本标识（所有现有数据都是 V3）
UPDATE public.pool_daily_revenue 
SET version = 'v3' 
WHERE version IS NULL OR version = '';

-- 添加检查约束
ALTER TABLE public.pool_daily_revenue 
ADD CONSTRAINT chk_pool_daily_revenue_version 
CHECK (version IN ('v3', 'v4'));

-- 更新现有的唯一约束，包含版本字段
ALTER TABLE public.pool_daily_revenue 
DROP CONSTRAINT IF EXISTS uk_pool_daily_revenue;

ALTER TABLE public.pool_daily_revenue 
ADD CONSTRAINT uk_pool_daily_revenue_v2 
UNIQUE (pool_address, date, version);
