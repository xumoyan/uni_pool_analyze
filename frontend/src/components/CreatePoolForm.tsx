"use client"

import { useState } from "react"
import {
  Pool,
  PoolV4,
  CreatePoolDto,
  CreatePoolV4Dto,
  poolApi,
  poolV4Api,
} from "@/services/api"
import { XMarkIcon } from "@heroicons/react/24/outline"

interface CreatePoolFormProps {
  onPoolCreated: (pool: Pool | PoolV4) => void
  onCancel: () => void
}

export default function CreatePoolForm({
  onPoolCreated,
  onCancel,
}: CreatePoolFormProps) {
  const [version, setVersion] = useState<"v3" | "v4">("v3")
  const [chainId, setChainId] = useState<number>(130) // 默认 Unichain
  const [formData, setFormData] = useState<CreatePoolDto>({
    token0Address: "",
    token1Address: "",
    feeTier: 3000,
    chainId: 130,
  })
  const [v4FormData, setV4FormData] = useState<CreatePoolV4Dto>({
    token0Address: "",
    token1Address: "",
    feeTier: 3000,
    tickSpacing: 60,
    hooksAddress: "0x0000000000000000000000000000000000000000",
    chainId: 130,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const currentFormData = version === "v3" ? formData : v4FormData

    if (!currentFormData.token0Address || !currentFormData.token1Address) {
      setError("请填写所有必填字段")
      return
    }

    if (currentFormData.token0Address === currentFormData.token1Address) {
      setError("两个代币地址不能相同")
      return
    }

    try {
      setLoading(true)
      setError("")

      let newPool
      if (version === "v3") {
        newPool = await poolApi.createPool(formData)
      } else {
        // 调用 V4 API
        newPool = await poolV4Api.createPoolV4(v4FormData)
      }

      onPoolCreated(newPool as unknown as Pool | PoolV4)
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : (
              error as {
                response?: { data?: { message?: string } }
                message?: string
              }
            )?.response?.data?.message ||
            (error as { message?: string })?.message ||
            "创建池子失败"
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (
    field: keyof CreatePoolDto,
    value: string | number
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError("") // 清除错误信息
  }

  // 处理链切换，同步更新两个表单的 chainId
  const handleChainChange = (newChainId: number) => {
    setChainId(newChainId)
    setFormData((prev) => ({ ...prev, chainId: newChainId }))
    setV4FormData((prev) => ({ ...prev, chainId: newChainId }))
    setError("")
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">添加新池子</h3>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 链选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                区块链网络 *
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="1"
                    checked={chainId === 1}
                    onChange={(e) =>
                      handleChainChange(parseInt(e.target.value))
                    }
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">
                    Ethereum (Chain ID: 1)
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="130"
                    checked={chainId === 130}
                    onChange={(e) =>
                      handleChainChange(parseInt(e.target.value))
                    }
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">
                    Unichain (Chain ID: 130)
                  </span>
                </label>
              </div>
            </div>

            {/* 版本选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Uniswap 版本 *
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="v3"
                    checked={version === "v3"}
                    onChange={(e) => setVersion(e.target.value as "v3" | "v4")}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">V3 (传统池子)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="v4"
                    checked={version === "v4"}
                    onChange={(e) => setVersion(e.target.value as "v3" | "v4")}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">V4 (新版本)</span>
                </label>
              </div>
            </div>

            <div>
              <label
                htmlFor="token0Address"
                className="block text-sm font-medium text-gray-700"
              >
                Token 0 地址 *
              </label>
              <input
                type="text"
                id="token0Address"
                value={
                  version === "v3"
                    ? formData.token0Address
                    : v4FormData.token0Address
                }
                onChange={(e) => {
                  if (version === "v3") {
                    handleInputChange("token0Address", e.target.value)
                  } else {
                    setV4FormData((prev) => ({
                      ...prev,
                      token0Address: e.target.value,
                    }))
                    setError("")
                  }
                }}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0x..."
                required
              />
            </div>

            <div>
              <label
                htmlFor="token1Address"
                className="block text-sm font-medium text-gray-700"
              >
                Token 1 地址 *
              </label>
              <input
                type="text"
                id="token1Address"
                value={
                  version === "v3"
                    ? formData.token1Address
                    : v4FormData.token1Address
                }
                onChange={(e) => {
                  if (version === "v3") {
                    handleInputChange("token1Address", e.target.value)
                  } else {
                    setV4FormData((prev) => ({
                      ...prev,
                      token1Address: e.target.value,
                    }))
                    setError("")
                  }
                }}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="0x..."
                required
              />
            </div>

            <div>
              <label
                htmlFor="feeTier"
                className="block text-sm font-medium text-gray-700"
              >
                费率 *
              </label>
              <select
                id="feeTier"
                value={version === "v3" ? formData.feeTier : v4FormData.feeTier}
                onChange={(e) => {
                  if (version === "v3") {
                    handleInputChange("feeTier", parseInt(e.target.value))
                  } else {
                    setV4FormData((prev) => ({
                      ...prev,
                      feeTier: parseInt(e.target.value),
                    }))
                    setError("")
                  }
                }}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value={100}>0.01% (100)</option>
                <option value={500}>0.05% (500)</option>
                <option value={3000}>0.3% (3000)</option>
                <option value={10000}>1% (10000)</option>
              </select>
            </div>

            {/* V4 特有字段 */}
            {version === "v4" && (
              <>
                <div>
                  <label
                    htmlFor="tickSpacing"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Tick 间距 *
                  </label>
                  <select
                    id="tickSpacing"
                    value={v4FormData.tickSpacing}
                    onChange={(e) => {
                      setV4FormData((prev) => ({
                        ...prev,
                        tickSpacing: parseInt(e.target.value),
                      }))
                      setError("")
                    }}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value={1}>1 (0.01% 费率推荐)</option>
                    <option value={10}>10 (0.05% 费率推荐)</option>
                    <option value={60}>60 (0.3% 费率推荐)</option>
                    <option value={200}>200 (1% 费率推荐)</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Tick 间距决定了流动性的精细度，通常与费率相匹配
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="hooksAddress"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Hooks 合约地址
                  </label>
                  <input
                    type="text"
                    id="hooksAddress"
                    value={v4FormData.hooksAddress || ""}
                    onChange={(e) => {
                      setV4FormData((prev) => ({
                        ...prev,
                        hooksAddress: e.target.value,
                      }))
                      setError("")
                    }}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0x0000000000000000000000000000000000000000 (无 hooks)"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    可选：自定义 hooks 合约地址，留空则使用零地址（无 hooks）
                  </p>
                </div>
              </>
            )}

            {error && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "创建中..." : "创建池子"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
