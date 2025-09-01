"use client"

import { useState } from "react"
import { Pool } from "@/services/api"
import {
  TrashIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  ChartBarIcon,
} from "@heroicons/react/24/outline"
import Link from "next/link"

interface PoolListProps {
  pools: Pool[]
  onPoolDeleted: (poolAddress: string) => void
  onPoolStatusUpdated: (poolAddress: string, isActive: boolean) => void
  onRefresh: () => void
}

export default function PoolList({
  pools = [],
  onPoolDeleted,
  onPoolStatusUpdated,
  onRefresh,
}: PoolListProps) {
  const [deletingPool, setDeletingPool] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  const handleDeletePool = async (pool: Pool) => {
    if (
      !confirm(`确定要删除池子 ${pool.token0Symbol}/${pool.token1Symbol} 吗？`)
    ) {
      return
    }

    try {
      setDeletingPool(pool.address)
      await fetch(`/api/pools/${pool.address}`, { method: "DELETE" })
      onPoolDeleted(pool.address)
    } catch (error) {
      console.error("删除池子失败:", error)
      alert("删除池子失败")
    } finally {
      setDeletingPool(null)
    }
  }

  const handleToggleStatus = async (pool: Pool) => {
    try {
      setUpdatingStatus(pool.address)
      await fetch(`/api/pools/${pool.address}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !pool.isActive }),
      })
      onPoolStatusUpdated(pool.address, !pool.isActive)
    } catch (error) {
      console.error("更新池子状态失败:", error)
      alert("更新池子状态失败")
    } finally {
      setUpdatingStatus(null)
    }
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
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            池子列表
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            共 {pools.length} 个池子
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <ArrowPathIcon className="h-4 w-4 mr-2" />
          刷新
        </button>
      </div>

      <ul className="divide-y divide-gray-200">
        {pools.map((pool) => (
          <li key={pool.address}>
            <div className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-sm font-medium text-blue-800">
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
                    </div>
                    <div className="mt-1 flex items-center text-sm text-gray-500">
                      <span className="mr-4">
                        费率: {pool.feeTier / 10000}%
                      </span>
                      <span className="mr-4">
                        地址: {pool.address.slice(0, 8)}...
                        {pool.address.slice(-6)}
                      </span>
                      <span>当前Tick: {pool.currentTick}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Link
                    href={`/pool/${pool.address}`}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <ChartBarIcon className="h-4 w-4 mr-2" />
                    分析
                  </Link>

                  <button
                    onClick={() => handleToggleStatus(pool)}
                    disabled={updatingStatus === pool.address}
                    className={`inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                      pool.isActive
                        ? "text-yellow-700 bg-yellow-50 border-yellow-300 hover:bg-yellow-100"
                        : "text-green-700 bg-green-50 border-green-300 hover:bg-green-100"
                    }`}
                  >
                    {updatingStatus === pool.address ? (
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
                    disabled={deletingPool === pool.address}
                    className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    {deletingPool === pool.address ? (
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
