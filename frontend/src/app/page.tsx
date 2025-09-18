"use client"

import { useState } from "react"
import { Pool, PoolV4 } from "@/services/api"
import UnifiedPoolList from "@/components/UnifiedPoolList"
import CreatePoolForm from "@/components/CreatePoolForm"
import { PlusIcon } from "@heroicons/react/24/outline"

export default function Home() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const handlePoolCreated = () => {
    setShowCreateForm(false)
    // 触发列表刷新
    setRefreshKey((prev) => prev + 1)
  }

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 头部 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Uniswap V3/V4 流动性分析器
          </h1>
          <p className="mt-2 text-gray-600">
            实时监控和分析 Uniswap V3 和 V4 池子的流动性分布情况
          </p>
        </div>

        {/* 导航栏 */}
        <div className="mb-6 flex justify-between items-center">
          <div className="flex space-x-4">
            <button
              onClick={() => setShowCreateForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              添加池子
            </button>
            <a
              href="/revenue"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              收益分析
            </a>
            <a
              href="/admin"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              管理后台
            </a>
          </div>
        </div>

        {/* 池子列表 */}
        <UnifiedPoolList key={refreshKey} onRefresh={handleRefresh} />

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
