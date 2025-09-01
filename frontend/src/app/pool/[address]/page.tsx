// frontend/src/app/pool/[address]/page.tsx
"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import {
  Pool,
  liquidityApi,
  poolApi,
  LiquidityStats,
  LiquidityDistribution,
} from "@/services/api"
import { ChartBarIcon, ArrowPathIcon } from "@heroicons/react/24/outline"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"
import { Bar } from "react-chartjs-2"

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface LiquidityData {
  id: number
  poolAddress: string
  tick: number
  price: number
  liquidityGross: string
  liquidityNet: string
  initialized: boolean
  token0Amount: string
  token1Amount: string
  token0AmountFormatted: string | number
  token1AmountFormatted: string | number
  activeLiquidity: string
  distanceFromCurrent: number
  scannedAt: string
  createdAt: string
  updatedAt: string
  blockNumber: number
  blockTimestamp: Date
}

export default function PoolDetailPage() {
  // 柱状图分页状态（与表格分页分离）
  const params = useParams()
  const poolAddress = params.address as string

  const [pool, setPool] = useState<Pool | null>(null)
  // 所有 tick 数据（最大 blockNumber 下）
  const [liquidityData, setLiquidityData] = useState<LiquidityData[]>([])

  // 柱状图分页状态（与表格分页分离）
  const [chartPage, setChartPage] = useState(1)
  const [chartPageSize, setChartPageSize] = useState(50)
  const chartTotalPages = Math.ceil(liquidityData.length / chartPageSize)
  const [distribution, setDistribution] = useState<{
    distributions: LiquidityDistribution[]
  } | null>(null)
  const [stats, setStats] = useState<LiquidityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collecting, setCollecting] = useState(false)

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [totalItems, setTotalItems] = useState(0)

  // 新增 state
  const [priceDirection, setPriceDirection] = useState<
    "token0ToToken1" | "token1ToToken0"
  >("token0ToToken1")

  useEffect(() => {
    if (poolAddress) {
      loadPoolData()
    }
  }, [poolAddress])

  useEffect(() => {
    if (poolAddress) {
      loadAllLiquidityData()
    }
  }, [poolAddress])

  const loadPoolData = async () => {
    try {
      setLoading(true)
      setError(null)
      console.log("开始加载池子数据:", poolAddress)

      const [poolData, liquidityStats, distributionData] = await Promise.all([
        poolApi.getPoolByAddress(poolAddress),
        liquidityApi.getLiquidityStats(poolAddress),
        liquidityApi.getLiquidityDistribution(poolAddress, 20),
      ])

      setPool(poolData)
      setStats(liquidityStats)
      setDistribution(distributionData)
    } catch (err: unknown) {
      console.error("加载池子数据失败:", err)
      setError(err instanceof Error ? err.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }

  // 获取最大 blockNumber 下所有初始化 tick 数据
  const loadAllLiquidityData = async () => {
    try {
      // 假设后端支持获取所有 tick 数据（可根据实际接口调整）
      const response = await liquidityApi.getAllPoolLiquidity(poolAddress)
      setLiquidityData(response.data || [])
      setTotalItems(response.data?.length || 0)
    } catch (err: unknown) {
      console.error("加载所有流动性数据失败:", err)
    }
  }

  const handleManualCollect = async () => {
    setCollecting(true)
    poolApi.manualCollect(poolAddress) // 不等待
    alert("数据收集已触发，请稍后刷新页面查看最新数据")
    setCollecting(false)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setCurrentPage(1)
  }

  const totalPages = Math.ceil(totalItems / pageSize)

  // 格式化数字显示
  const formatNumber = (value: string | number): string => {
    if (typeof value === "string") {
      const num = parseFloat(value)
      return isNaN(num) ? "0.000000" : num.toFixed(6)
    }
    return value.toFixed(6)
  }

  const getDisplayPrice = (price: number) => {
    if (priceDirection === "token0ToToken1") return price
    if (price === 0) return 0
    return 1 / price
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-600">加载中...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-red-600">错误: {error}</p>
            <button
              onClick={loadPoolData}
              className="mt-4 inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
            >
              <ArrowPathIcon className="h-4 w-4 mr-2" />
              重试
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!pool) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-red-600">池子不存在</p>
            <p className="text-gray-500 mt-2">地址: {poolAddress}</p>
          </div>
        </div>
      </div>
    )
  }

  const chartPageStart = (chartPage - 1) * chartPageSize
  const chartPageEnd = chartPageStart + chartPageSize
  const chartPageData = liquidityData.slice(chartPageStart, chartPageEnd)
  const chartLabels = chartPageData.map((item) => {
    const priceNum = Number(item.price)
    const priceVal = getDisplayPrice(priceNum)

    let formattedPrice

    if (priceVal >= 1000000) {
      formattedPrice = priceVal.toFixed(0).slice(0, 6) + "..."
    } else if (priceVal >= 1000) {
      formattedPrice = Math.floor(priceVal).toLocaleString("en-US", {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      })
    } else if (priceVal >= 1) {
      formattedPrice = priceVal.toLocaleString("en-US", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      })
    } else {
      formattedPrice = priceVal.toLocaleString("en-US", {
        maximumFractionDigits: 6,
        minimumFractionDigits: 6,
      })
    }

    return formattedPrice
  })
  const chartData = chartPageData.map((item) => Number(item.liquidityGross))
  const distributionChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "流动性分布",
        data: chartData,
        backgroundColor: "rgba(59, 130, 246, 0.5)",
        borderColor: "rgba(59, 130, 246, 1)",
        borderWidth: 1,
      },
    ],
  }

  // 明细表分页数据（只保留这一组定义）
  const tablePageStart = (currentPage - 1) * pageSize
  const tablePageEnd = tablePageStart + pageSize
  const tablePageData = liquidityData.slice(tablePageStart, tablePageEnd)

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {pool.token0Symbol}/{pool.token1Symbol} 流动性分析
              </h1>
              <p className="mt-2 text-gray-600">池子地址: {pool.address}</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleManualCollect}
                disabled={collecting}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {collecting ? (
                  <ArrowPathIcon className="animate-spin h-4 w-4 mr-2" />
                ) : (
                  <ChartBarIcon className="h-4 w-4 mr-2" />
                )}
                {collecting ? "收集中..." : "手动收集数据"}
              </button>
              <button
                onClick={loadPoolData}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <ArrowPathIcon className="h-4 w-4 mr-2" />
                刷新
              </button>
              <button
                onClick={() =>
                  setPriceDirection(
                    priceDirection === "token0ToToken1"
                      ? "token1ToToken0"
                      : "token0ToToken1"
                  )
                }
                className="ml-4 px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                {priceDirection === "token0ToToken1"
                  ? `价格：${pool.token0Symbol} / ${pool.token1Symbol}`
                  : `价格： ${pool.token1Symbol} / ${pool.token0Symbol}`}
              </button>
            </div>
          </div>
        </div>

        {/* 池子基本信息 */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              池子信息
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">代币对</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {pool.token0Symbol}/{pool.token1Symbol}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">费率</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {pool.feeTier / 10000}%
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">当前Tick</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {pool.currentTick}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">状态</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      pool.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {pool.isActive ? "活跃" : "暂停"}
                  </span>
                </dd>
              </div>
            </div>
          </div>
        </div>

        {/* 流动性统计 */}
        {stats && (
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                流动性统计
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    总Tick数量
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900">
                    {Number(stats.total_ticks || 0).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    总流动性
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900">
                    {Number(stats.total_liquidity || 0).toLocaleString()}
                  </dd>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    总 token0 数量
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900">
                    {(() => {
                      let val = pool.totalAmount0
                      let num = Number(val)
                      let decimals = pool.token0Decimals ?? 18
                      num = num / Math.pow(10, decimals)
                      return `${num.toLocaleString("en-US", {
                        minimumFractionDigits: 6,
                        maximumFractionDigits: 6,
                      })} ${pool.token0Symbol}`
                    })()}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    总 token1 数量
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900">
                    {(() => {
                      let val = pool.totalAmount1
                      let num = Number(val)
                      let decimals = pool.token1Decimals ?? 18
                      num = num / Math.pow(10, decimals)
                      return `${num.toLocaleString("en-US", {
                        minimumFractionDigits: 6,
                        maximumFractionDigits: 6,
                      })} ${pool.token1Symbol}`
                    })()}
                  </dd>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 流动性分布图表（独立分页） */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              流动性分布
            </h3>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">
                  柱状图每页显示:
                </label>
                <select
                  value={chartPageSize}
                  onChange={(e) => {
                    setChartPageSize(Number(e.target.value))
                    setChartPage(1)
                  }}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setChartPage(chartPage - 1)}
                  disabled={chartPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  第 {chartPage} 页，共 {chartTotalPages} 页
                </span>
                <button
                  onClick={() => setChartPage(chartPage + 1)}
                  disabled={chartPage === chartTotalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            </div>
            <div className="h-96">
              <Bar
                data={distributionChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: "top" as const,
                    },
                    title: {
                      display: true,
                      text: `流动性分布图 (每页${chartPageSize}条)`,
                    },
                    tooltip: {
                      callbacks: {
                        label: function (context) {
                          const idx = context.dataIndex
                          const item = chartPageData[idx]
                          return [
                            `价格: ${getDisplayPrice(item.price)}`,
                            `Tick: ${item.tick}`,
                            `LiquidityGross: ${item.liquidityGross}`,
                            `LiquidityNet: ${item.liquidityNet}`,
                            `Token0数量: ${item.token0AmountFormatted} ${pool.token0Symbol}`,
                            `Token1数量: ${item.token1AmountFormatted} ${pool.token1Symbol}`,
                            `Block: ${item.blockNumber}`,
                            `时间: ${item.blockTimestamp}`,
                          ]
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      title: {
                        display: true,
                        text: "价格 (USD)",
                      },
                    },
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: "流动性 (liquidityGross)",
                      },
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>

        {/* 流动性数据表格 */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Tick 流动性数据
              </h3>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">
                    每页显示:
                  </label>
                  <select
                    value={pageSize}
                    onChange={(e) =>
                      handlePageSizeChange(Number(e.target.value))
                    }
                    className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tick
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      价格
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      流动性
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Token0 数量
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Token1 数量
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tablePageData.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.tick}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${getDisplayPrice(Number(item.price)).toFixed(6)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.liquidityGross.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatNumber(item.token0AmountFormatted)}{" "}
                        {pool.token0Symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatNumber(item.token1AmountFormatted)}{" "}
                        {pool.token1Symbol}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页控件 */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-700">
                显示第 {(currentPage - 1) * pageSize + 1} 到{" "}
                {Math.min(currentPage * pageSize, totalItems)} 条，共{" "}
                {totalItems} 条
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一页
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  第 {currentPage} 页，共 {totalPages} 页
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
