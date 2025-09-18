-- 修复 pool_daily_revenue 表的 pool_address 字段长度
-- V4 的 PoolId 是 66 个字符 (0x + 64 hex chars)，而 V3 的地址是 42 个字符

ALTER TABLE public.pool_daily_revenue 
ALTER COLUMN pool_address TYPE character varying(66);

-- 添加注释
COMMENT ON COLUMN public.pool_daily_revenue.pool_address IS 'V3 池子地址(42字符) 或 V4 PoolId(66字符)';

-- 验证修改
SELECT 
    column_name, 
    data_type, 
    character_maximum_length 
FROM information_schema.columns 
WHERE table_name = 'pool_daily_revenue' 
AND column_name = 'pool_address';
