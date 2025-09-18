"use client"

import { useState, useEffect } from "react"
import { Pool, PoolV4, poolApi, poolV4Api } from "@/services/api"
import {
  TrashIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline"
import Link from "next/link"

interface UnifiedPoolListProps {
  onRefresh: () => void
}

type UnifiedPool =
  | (Pool & { version: "v3"; identifier: string })
  | (PoolV4 & { version: "v4"; identifier: string })

export default function UnifiedPoolList({ onRefresh }: UnifiedPoolListProps) {
  const [pools, setPools] = useState<UnifiedPool[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingPool, setDeletingPool] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "v3" | "v4">("all")

  const loadPools = async () => {
    try {
      setLoading(true)

      // 并行获取 V3 和 V4 池子
      const [v3Pools, v4Pools] = await Promise.all([
        poolApi.getAllPools().catch(() => []),
        poolV4Api.getAllPoolsV4().catch(() => []),
      ])

      // 统一格式
      const unifiedPools: UnifiedPool[] = [
        ...v3Pools.map((pool) => ({
          ...pool,
          version: "v3" as const,
          identifier: pool.address,
        })),
        ...v4Pools.map((pool) => ({
          ...pool,
          version: "v4" as const,
          identifier: pool.poolId,
        })),
      ]

      setPools(unifiedPools)
    } catch (error) {
      console.error("加载池子列表失败:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPools()
  }, [])

  const handleDeletePool = async (pool: UnifiedPool) => {
    const poolName =
      pool.version === "v3"
        ? `${pool.token0Symbol}/${pool.token1Symbol} (V3)`
        : `${pool.token0Symbol}/${pool.token1Symbol} (V4)`

    if (!confirm(`确定要删除池子 ${poolName} 吗？`)) {
      return
    }

    try {
      setDeletingPool(pool.identifier)

      if (pool.version === "v3") {
        await poolApi.deletePool(pool.identifier)
      } else {
        await poolV4Api.deletePool(pool.identifier)
      }

      // 重新加载列表
      await loadPools()
      onRefresh()
    } catch (error) {
      console.error("删除池子失败:", error)
      alert("删除池子失败")
    } finally {
      setDeletingPool(null)
    }
  }

  const handleToggleStatus = async (pool: UnifiedPool) => {
    try {
      setUpdatingStatus(pool.identifier)

      if (pool.version === "v3") {
        await poolApi.updatePoolStatus(pool.identifier, !pool.isActive)
      } else {
        await poolV4Api.updatePoolStatus(pool.identifier, !pool.isActive)
      }

      // 重新加载列表
      await loadPools()
      onRefresh()
    } catch (error) {
      console.error("更新池子状态失败:", error)
      alert("更新池子状态失败")
    } finally {
      setUpdatingStatus(null)
    }
  }

  const filteredPools = pools.filter((pool) => {
    if (filter === "all") return true
    return pool.version === filter
  })

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        <p className="mt-4 text-gray-500">加载池子列表中...</p>
      </div>
    )
  }

  if (pools.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500">
          <p className="text-lg">还没有添加任何池子</p>
          <p className="text-sm mt-2">点击"添加池子"按钮开始监控</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <div className="px-4 py-5 sm:px-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              池子列表
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              共 {pools.length} 个池子 (V3:{" "}
              {pools.filter((p) => p.version === "v3").length}, V4:{" "}
              {pools.filter((p) => p.version === "v4").length})
            </p>
          </div>
          <button
            onClick={() => {
              loadPools()
              onRefresh()
            }}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ArrowPathIcon className="h-4 w-4 mr-2" />
            刷新
          </button>
        </div>

        {/* 版本过滤器 */}
        <div className="flex space-x-1 mb-4">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-sm rounded-md ${
              filter === "all"
                ? "bg-blue-100 text-blue-700 border border-blue-300"
                : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
            }`}
          >
            全部 ({pools.length})
          </button>
          <button
            onClick={() => setFilter("v3")}
            className={`px-3 py-1 text-sm rounded-md ${
              filter === "v3"
                ? "bg-green-100 text-green-700 border border-green-300"
                : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
            }`}
          >
            V3 ({pools.filter((p) => p.version === "v3").length})
          </button>
          <button
            onClick={() => setFilter("v4")}
            className={`px-3 py-1 text-sm rounded-md ${
              filter === "v4"
                ? "bg-purple-100 text-purple-700 border border-purple-300"
                : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
            }`}
          >
            V4 ({pools.filter((p) => p.version === "v4").length})
          </button>
        </div>
      </div>

      <ul className="divide-y divide-gray-200">
        {filteredPools.map((pool) => (
          <li key={pool.identifier}>
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        pool.version === "v3" ? "bg-green-100" : "bg-purple-100"
                      }`}
                    >
                      <span
                        className={`text-sm font-medium ${
                          pool.version === "v3"
                            ? "text-green-800"
                            : "text-purple-800"
                        }`}
                      >
                        {pool.token0Symbol[0]}
                        {pool.token1Symbol[0]}
                      </span>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="flex items-center">
                      <p className="text-sm font-medium text-gray-900">
                        {pool.token0Symbol}/{pool.token1Symbol}
                      </p>
                      <span
                        className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          pool.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {pool.isActive ? "活跃" : "暂停"}
                      </span>
                      <span
                        className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          pool.version === "v3"
                            ? "bg-green-100 text-green-800"
                            : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {pool.version.toUpperCase()}
                      </span>
                      {pool.version === "v4" &&
                        pool.hooksAddress &&
                        pool.hooksAddress !==
                          "0x0000000000000000000000000000000000000000" && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            Hooks
                          </span>
                        )}
                    </div>
                    <div className="mt-1 flex items-center text-sm text-gray-500">
                      <span className="mr-4">
                        费率: {pool.feeTier / 10000}%
                      </span>
                      {pool.version === "v3" ? (
                        <span className="mr-4">
                          地址: {pool.identifier.slice(0, 8)}...
                          {pool.identifier.slice(-6)}
                        </span>
                      ) : (
                        <span className="mr-4">
                          PoolId: {pool.identifier.slice(0, 8)}...
                          {pool.identifier.slice(-6)}
                        </span>
                      )}
                      <span className="mr-4">当前Tick: {pool.currentTick}</span>
                      {pool.version === "v4" && (
                        <span>Tick间距: {pool.tickSpacing}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Link
                    href={
                      pool.version === "v3"
                        ? `/pool/${pool.identifier}`
                        : `/pool-v4/${pool.identifier}`
                    }
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <ChartBarIcon className="h-4 w-4 mr-2" />
                    分析
                  </Link>

                  <button
                    onClick={() => handleToggleStatus(pool)}
                    disabled={updatingStatus === pool.identifier}
                    className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      pool.isActive
                        ? "text-yellow-700 bg-yellow-50 border-yellow-300 hover:bg-yellow-100"
                        : "text-green-700 bg-green-50 border-green-300 hover:bg-green-100"
                    }`}
                  >
                    {updatingStatus === pool.identifier ? (
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                    ) : pool.isActive ? (
                      <PauseIcon className="h-4 w-4 mr-2" />
                    ) : (
                      <PlayIcon className="h-4 w-4 mr-2" />
                    )}
                    {pool.isActive ? "暂停" : "启动"}
                  </button>

                  <button
                    onClick={() => handleDeletePool(pool)}
                    disabled={deletingPool === pool.identifier}
                    className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    {deletingPool === pool.identifier ? (
                      <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
                    ) : (
                      <TrashIcon className="h-4 w-4 mr-2" />
                    )}
                    删除
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
