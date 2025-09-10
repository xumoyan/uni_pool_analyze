"use client"

import React, { useState, useEffect } from "react"
import { poolApi, revenueApi, Pool } from "../../services/api"

export default function AdminPage() {
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  useEffect(() => {
    fetchPools()
  }, [])

  const fetchPools = async () => {
    try {
      const response = await poolApi.getAllPools()
      console.log("API Response:", response) // 调试日志

      // 检查响应格式
      if (Array.isArray(response)) {
        // 直接返回数组
        setPools(response)
      } else if (response.success && response.data) {
        // 包装在success对象中
        setPools(response.data)
      } else if (response.data && Array.isArray(response.data)) {
        // data字段包含数组
        setPools(response.data)
      } else {
        console.error("未知的API响应格式:", response)
      }
    } catch (error) {
      console.error("获取池子列表失败:", error)
    }
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`])
  }

  const collectAllHistoricalData = async () => {
    if (pools.length === 0) {
      addLog("❌ 没有找到池子")
      return
    }

    setLoading(true)
    setProgress({ current: 0, total: pools.length })
    setLogs([])

    addLog(`🚀 开始收集 ${pools.length} 个池子的历史数据...`)

    try {
      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i]
        setProgress({ current: i + 1, total: pools.length })

        addLog(
          `🔄 [${i + 1}/${pools.length}] 开始收集 ${pool.token0Symbol}-${
            pool.token1Symbol
          }`
        )

        try {
          const response = await revenueApi.syncHistoricalRevenue(
            pool.address,
            undefined, // startBlockNumber
            undefined, // endBlockNumber
            7200 // blockInterval (约1天)
          )

          if (response.success) {
            addLog(`   ✅ 成功同步 ${response.data.syncedRecords} 条记录`)
          } else {
            addLog(`   ❌ 同步失败: ${response.message}`)
          }
        } catch (error: any) {
          addLog(
            `   ❌ 收集失败: ${error.response?.data?.message || error.message}`
          )
        }

        // 延迟1秒，避免请求过于频繁
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      addLog("🎉 所有池子的历史数据收集完成！")
    } catch (error: any) {
      addLog(`❌ 收集过程中出错: ${error.message}`)
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  const collectSinglePoolData = async (poolAddress: string) => {
    const pool = pools.find((p) => p.address === poolAddress)
    if (!pool) return

    setLoading(true)
    addLog(
      `🔄 开始收集单个池子 ${pool.token0Symbol}-${pool.token1Symbol} 的历史数据...`
    )

    try {
      const response = await revenueApi.syncHistoricalRevenue(
        poolAddress,
        undefined, // startBlockNumber
        undefined, // endBlockNumber
        7200 // blockInterval (约1天)
      )

      if (response.success) {
        addLog(`✅ 成功同步 ${response.data.syncedRecords} 条记录`)
      } else {
        addLog(`❌ 同步失败: ${response.message}`)
      }
    } catch (error: any) {
      addLog(`❌ 收集失败: ${error.response?.data?.message || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">数据管理后台</h1>
        <p className="text-gray-600">收集和管理池子的历史收益数据</p>
      </div>

      {/* 操作面板 */}
      <div className="mb-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">历史数据收集</h2>

        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={collectAllHistoricalData}
            disabled={loading || pools.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "收集中..." : "收集所有池子历史数据"}
          </button>

          <button
            onClick={clearLogs}
            disabled={loading}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            清空日志
          </button>

          <div className="text-sm text-gray-600">
            找到 {pools.length} 个池子
          </div>
        </div>

        {/* 进度条 */}
        {loading && progress.total > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>收集进度</span>
              <span>
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${(progress.current / progress.total) * 100}%`,
                }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* 池子列表 */}
      <div className="mb-8 p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">池子列表</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pools.map((pool) => (
            <div
              key={pool.address}
              className="p-4 border border-gray-200 rounded-lg"
            >
              <h3 className="font-semibold text-lg mb-2">
                {pool.token0Symbol}-{pool.token1Symbol}
              </h3>
              <div className="space-y-1 text-sm text-gray-600 mb-3">
                <p>费率: {pool.feeTier / 10000}%</p>
                <p>地址: {pool.address.slice(0, 10)}...</p>
                <p>创建时间: {new Date(pool.createdAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => collectSinglePoolData(pool.address)}
                disabled={loading}
                className="w-full px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                收集此池子
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 日志面板 */}
      <div className="p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4">操作日志</h2>

        <div className="bg-gray-900 text-green-400 p-4 rounded-lg h-96 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-gray-500">等待操作...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="mb-1">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
