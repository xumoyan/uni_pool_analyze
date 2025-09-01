"use client"

import { useState, useEffect } from "react"
import { Pool, poolApi } from "@/services/api"
import PoolList from "@/components/PoolList"
import CreatePoolForm from "@/components/CreatePoolForm"
import { PlusIcon } from "@heroicons/react/24/outline"

export default function Home() {
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)

  useEffect(() => {
    loadPools()
  }, [])

  const loadPools = async () => {
    try {
      setLoading(true)
      const data = await poolApi.getAllPools()
      setPools(data)
    } catch (error) {
      console.error("加载池子失败:", error)
    } finally {
      setLoading(false)
    }
  }

  const handlePoolCreated = (newPool: Pool) => {
    setPools([newPool, ...pools])
    setShowCreateForm(false)
  }

  const handlePoolDeleted = (poolAddress: string) => {
    setPools(pools.filter((pool) => pool.address !== poolAddress))
  }

  const handlePoolStatusUpdated = (poolAddress: string, isActive: boolean) => {
    setPools(
      pools.map((pool) =>
        pool.address === poolAddress ? { ...pool, isActive } : pool
      )
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 头部 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Uniswap V3 流动性分析器
          </h1>
          <p className="mt-2 text-gray-600">
            实时监控和分析 Uniswap V3 池子的流动性分布情况
          </p>
        </div>

        {/* 操作栏 */}
        <div className="mb-6 flex justify-between items-center">
          <div className="flex space-x-4">
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              添加池子
            </button>
          </div>
        </div>

        {/* 池子列表 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-500">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              加载中...
            </div>
          </div>
        ) : (
          <PoolList
            pools={pools}
            onPoolDeleted={handlePoolDeleted}
            onPoolStatusUpdated={handlePoolStatusUpdated}
            onRefresh={loadPools}
          />
        )}

        {/* 创建池子表单 */}
        {showCreateForm && (
          <CreatePoolForm
            onPoolCreated={handlePoolCreated}
            onCancel={() => setShowCreateForm(false)}
          />
        )}
      </div>
    </div>
  )
}
