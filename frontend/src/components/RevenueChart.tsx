"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { revenueApi, poolApi, Pool, RevenueChartData } from "../services/api"

interface RevenueChartProps {
  className?: string
}

interface ChartDataPoint {
  date: string
  [key: string]: string | number // 动态的池子数据
}

const COLORS = [
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#00ff00",
  "#ff00ff",
  "#00ffff",
  "#ff0000",
]

// 代币价格映射（简化实现）
const TOKEN_PRICES: { [key: string]: number } = {
  ETH: 2000,
  WETH: 2000,
  BTC: 40000,
  WBTC: 40000,
  USDC: 1,
  USDT: 1,
  DAI: 1,
}

export default function RevenueChart({ className }: RevenueChartProps) {
  const [pools, setPools] = useState<Pool[]>([])
  const [revenueData, setRevenueData] = useState<RevenueChartData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0], // 30天前
    endDate: new Date().toISOString().split("T")[0], // 今天
  })
  const [hiddenPools, setHiddenPools] = useState<Set<string>>(new Set())

  // 获取池子列表并自动获取收益数据
  useEffect(() => {
    const fetchPoolsAndData = async () => {
      try {
        const response = await poolApi.getAllPools()
        let poolsData: Pool[] = []

        // 检查响应格式
        if (Array.isArray(response)) {
          poolsData = response
        } else if ((response as any).success && (response as any).data) {
          poolsData = (response as any).data
        } else if (
          (response as any).data &&
          Array.isArray((response as any).data)
        ) {
          poolsData = (response as any).data
        }

        if (poolsData.length > 0) {
          setPools(poolsData)
          // 池子数据获取成功，稍后会通过另一个useEffect获取收益数据
        }
      } catch (error) {
        console.error("获取池子列表失败:", error)
        setError("获取池子列表失败")
      }
    }

    fetchPoolsAndData()
  }, [])

  // 获取收益数据
  const fetchRevenueData = useCallback(
    async (poolAddresses?: string[]) => {
      const addressesToFetch =
        poolAddresses || pools.map((pool) => pool.address)
      if (addressesToFetch.length === 0) return

      setLoading(true)
      setError(null)

      try {
        const response = await revenueApi.getRevenueChartData(
          addressesToFetch,
          dateRange.startDate,
          dateRange.endDate,
          100
        )

        if ((response as any).success && (response as any).data) {
          // 修复缺失的池子信息
          const fixedData = (response as any).data.map((item: any) => {
            if (!item.pool && item.poolAddress) {
              // 从已加载的池子列表中查找
              const poolInfo = pools.find((p) => p.address === item.poolAddress)
              if (poolInfo) {
                return { ...item, pool: poolInfo }
              }
            }
            return item
          })

          setRevenueData(fixedData)
        }
      } catch (error) {
        console.error("获取收益数据失败:", error)
        setError("获取收益数据失败")
      } finally {
        setLoading(false)
      }
    },
    [pools, dateRange.startDate, dateRange.endDate]
  )

  useEffect(() => {
    if (pools.length > 0) {
      fetchRevenueData()
    }
  }, [dateRange, fetchRevenueData, pools.length])

  // 处理图表数据
  const chartData = useMemo(() => {
    if (revenueData.length === 0) return []

    // 获取所有日期
    const allDates = new Set<string>()
    revenueData.forEach((poolData) => {
      poolData.data.forEach((item) => {
        allDates.add(item.date)
      })
    })

    const sortedDates = Array.from(allDates).sort()

    // 为每个日期创建数据点
    return sortedDates.map((date) => {
      const dataPoint: ChartDataPoint = { date }

      revenueData.forEach((poolData) => {
        const pool = poolData.pool

        // 安全检查：确保池子信息存在
        if (!pool || !pool.token0Symbol || !pool.token1Symbol) {
          console.warn("池子信息不完整:", poolData.poolAddress)
          return
        }

        const poolKey = `${pool.token0Symbol}-${pool.token1Symbol} (${(
          pool.feeTier / 10000
        ).toFixed(2)}%)`

        // 查找该日期的数据
        const dayData = poolData.data.find((item) => item.date === date)

        if (dayData) {
          // 计算USD价值
          const token0Price = TOKEN_PRICES[pool.token0Symbol.toUpperCase()] || 0
          const token1Price = TOKEN_PRICES[pool.token1Symbol.toUpperCase()] || 0

          const token0Amount = parseFloat(dayData.feeRevenueToken0Formatted)
          const token1Amount = parseFloat(dayData.feeRevenueToken1Formatted)

          const usdValue =
            token0Amount * token0Price + token1Amount * token1Price
          dataPoint[poolKey] = parseFloat(usdValue.toFixed(2))
        } else {
          dataPoint[poolKey] = 0
        }
      })

      return dataPoint
    })
  }, [revenueData])

  // 处理图例点击（隐藏/显示线条）
  const handleLegendClick = (dataKey: string) => {
    setHiddenPools((prev) => {
      const newHidden = new Set(prev)
      if (newHidden.has(dataKey)) {
        newHidden.delete(dataKey)
      } else {
        newHidden.add(dataKey)
      }
      return newHidden
    })
  }

  // 自定义工具提示
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean
    payload?: Array<{ dataKey: string; value: number; color: string }>
    label?: string
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-300 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{`日期: ${label}`}</p>
          {payload.map((entry, index: number) => (
            <p key={index} style={{ color: entry.color }} className="mb-1">
              {`${entry.dataKey}: ${entry.value} USDT`}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className={`bg-white p-6 rounded-lg shadow-md ${className}`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">池子收益趋势图</h2>

        {/* 日期范围控制 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">开始日期</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">结束日期</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) =>
                setDateRange((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={() => fetchRevenueData()}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "加载中..." : "刷新图表"}
            </button>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {/* 图表 */}
      <div className="h-96">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-lg">加载中...</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-lg text-gray-500">暂无数据</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                label={{
                  value: "USDT 收益",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                onClick={(e: any) => handleLegendClick(e.dataKey as string)}
                wrapperStyle={{ cursor: "pointer" }}
              />
              {revenueData
                .map((poolData, index) => {
                  const pool = poolData.pool

                  // 安全检查：确保池子信息存在
                  if (!pool || !pool.token0Symbol || !pool.token1Symbol) {
                    return null
                  }

                  const poolKey = `${pool.token0Symbol}-${
                    pool.token1Symbol
                  } (${(pool.feeTier / 10000).toFixed(2)}%)`
                  const isHidden = hiddenPools.has(poolKey)

                  return (
                    <Line
                      key={poolKey}
                      type="monotone"
                      dataKey={poolKey}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      connectNulls={false}
                      hide={isHidden}
                      strokeOpacity={isHidden ? 0.3 : 1}
                    />
                  )
                })
                .filter(Boolean)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 数据统计 */}
      {revenueData.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {revenueData
            .map((poolData) => {
              const pool = poolData.pool

              // 安全检查：确保池子信息存在
              if (!pool || !pool.token0Symbol || !pool.token1Symbol) {
                return null
              }

              const totalRevenue = poolData.data.reduce((sum, item) => {
                const token0Price =
                  TOKEN_PRICES[pool.token0Symbol.toUpperCase()] || 0
                const token1Price =
                  TOKEN_PRICES[pool.token1Symbol.toUpperCase()] || 0
                const token0Amount = parseFloat(item.feeRevenueToken0Formatted)
                const token1Amount = parseFloat(item.feeRevenueToken1Formatted)
                return (
                  sum + token0Amount * token0Price + token1Amount * token1Price
                )
              }, 0)

              return (
                <div key={pool.address} className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-lg mb-2">
                    {pool.token0Symbol}-{pool.token1Symbol} (
                    {(pool.feeTier / 10000).toFixed(2)}%)
                  </h3>
                  <div className="space-y-1 text-sm">
                    <p>总收益: {totalRevenue.toFixed(2)} USDT</p>
                    <p>数据天数: {poolData.data.length} 天</p>
                    <p>
                      平均日收益:{" "}
                      {(
                        totalRevenue / Math.max(poolData.data.length, 1)
                      ).toFixed(2)}{" "}
                      USDT
                    </p>
                  </div>
                </div>
              )
            })
            .filter(Boolean)}
        </div>
      )}
    </div>
  )
}
