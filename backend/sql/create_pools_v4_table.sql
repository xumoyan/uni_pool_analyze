-- 创建 Uniswap V4 池子表
CREATE TABLE public.pools_v4 (
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
    pool_key jsonb NULL, -- 存储 PoolKey 的 JSON 表示
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT pools_v4_pkey PRIMARY KEY (id),
    CONSTRAINT pools_v4_pool_id_unique UNIQUE (pool_id)
);

-- 创建索引
CREATE INDEX idx_pools_v4_pool_id ON public.pools_v4 (pool_id);
CREATE INDEX idx_pools_v4_tokens_fee ON public.pools_v4 (token0_address, token1_address, fee_tier);
CREATE INDEX idx_pools_v4_hooks ON public.pools_v4 (hooks_address);
CREATE INDEX idx_pools_v4_active ON public.pools_v4 (is_active);
CREATE INDEX idx_pools_v4_chain ON public.pools_v4 (chain_id);

-- 添加注释
COMMENT ON TABLE public.pools_v4 IS 'Uniswap V4 池子信息表';
COMMENT ON COLUMN public.pools_v4.pool_id IS 'V4 池子的唯一标识符 (PoolKey 的 keccak256 哈希)';
COMMENT ON COLUMN public.pools_v4.hooks_address IS 'V4 池子关联的 hooks 合约地址';
COMMENT ON COLUMN public.pools_v4.pool_manager_address IS 'V4 PoolManager 合约地址';
COMMENT ON COLUMN public.pools_v4.pool_key IS 'PoolKey 的 JSON 表示，用于调试和查询';
