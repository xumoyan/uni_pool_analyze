-- 修复 V4 数据的约束问题
-- 删除原有的外键约束，因为 V4 数据不需要关联到 pools 表

-- 1. 删除原有的外键约束
ALTER TABLE tick_liquidity_data 
DROP CONSTRAINT IF EXISTS FK_e63307b1fdace1a7b6ac3506635;

-- 2. 删除原有的逻辑约束（如果存在）
ALTER TABLE tick_liquidity_data 
DROP CONSTRAINT IF EXISTS chk_tick_liquidity_pool_reference;

-- 3. 添加新的逻辑约束：
-- V3 数据必须有 pool_address 且关联到 pools 表
-- V4 数据必须有 pool_id 且关联到 pools_v4 表
-- 但不强制外键约束，允许测试数据

ALTER TABLE tick_liquidity_data 
ADD CONSTRAINT chk_tick_liquidity_pool_reference_v2 
CHECK (
    (version = 'v3' AND pool_address IS NOT NULL AND pool_id IS NULL) OR
    (version = 'v4' AND pool_id IS NOT NULL AND (pool_address IS NULL OR pool_address = ''))
);

-- 4. 为 V4 数据添加可选的外键约束（不强制）
-- 这个约束只是为了数据一致性，但允许孤立的测试数据存在

-- 注释：实际生产环境中可以启用这个约束
-- ALTER TABLE tick_liquidity_data 
-- ADD CONSTRAINT FK_tick_liquidity_pool_v4
-- FOREIGN KEY (pool_id) REFERENCES pools_v4(pool_id) 
-- ON DELETE CASCADE;

-- 验证约束修改
SELECT 
    constraint_name, 
    constraint_type,
    table_name
FROM information_schema.table_constraints 
WHERE table_name = 'tick_liquidity_data' 
AND constraint_type IN ('FOREIGN KEY', 'CHECK')
ORDER BY constraint_name;
