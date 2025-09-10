"use client"

import React, { useState, useEffect } from "react"
import RevenueChart from "../../components/RevenueChart"
import { revenueApi, poolApi, Pool, RevenueStats } from "../../services/api"

export default function RevenuePage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<string>("")

  // 收集所有池子的最新收益数据
  const handleCollectLatestRevenue = async () => {
    setLoading(true)
    setSyncStatus("正在收集最新收益数据...")

    try {
      await revenueApi.collectAllPoolsRevenue()
      setSyncStatus("所有池子最新收益数据收集完成")
    } catch (error) {
      console.error("收集收益数据失败:", error)
      setSyncStatus("收集收益数据失败")
    } finally {
      setLoading(false)
      // 3秒后清除状态消息
      setTimeout(() => setSyncStatus(""), 3000)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">池子收益分析</h1>
        <p className="text-gray-600">查看和管理Uniswap V3池子的收益数据</p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {/* 同步状态提示 */}
      {syncStatus && (
        <div className="mb-6 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded-md">
          {syncStatus}
        </div>
      )}

      {/* 控制面板 */}
      <div className="mb-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">数据管理</h2>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleCollectLatestRevenue}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "处理中..." : "收集池子收益信息"}
          </button>

          <div className="text-sm text-gray-600">
            点击按钮获取所有池子最近一个月的收益数据，如果已有数据则从最新记录继续收集
          </div>
        </div>
      </div>

      {/* 收益趋势图 */}
      <RevenueChart className="mb-8" />

      {/* 使用说明 */}
      <div className="p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">使用说明</h2>
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>收集池子收益信息:</strong>{" "}
            获取所有活跃池子最近一个月的收益数据，系统会智能地从最新已有数据继续收集，避免重复处理
          </p>
          <p>
            <strong>图表说明:</strong>{" "}
            显示所有池子的USDT收益趋势，不同颜色代表不同池子，点击图例可隐藏/显示对应的线条
          </p>
          <p>
            <strong>价格计算:</strong>{" "}
            使用指定块高当前tick对应的价格进行USDT计价，所有池子都对USDT计价
          </p>
          <p>
            <strong>数据更新:</strong>{" "}
            系统每天凌晨1点自动收集前一天的收益数据，手动收集时会处理最近一个月的数据，提高收集效率
          </p>
        </div>
      </div>
    </div>
  )
}
