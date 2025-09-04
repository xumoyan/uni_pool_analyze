"use client"

import { useState } from "react"
import { Pool, CreatePoolDto, poolApi } from "@/services/api"
import { XMarkIcon } from "@heroicons/react/24/outline"

interface CreatePoolFormProps {
  onPoolCreated: (pool: Pool) => void
  onCancel: () => void
}

export default function CreatePoolForm({
  onPoolCreated,
  onCancel,
}: CreatePoolFormProps) {
  const [formData, setFormData] = useState<CreatePoolDto>({
    token0Address: "",
    token1Address: "",
    feeTier: 3000,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.token0Address || !formData.token1Address) {
      setError("请填写所有必填字段")
      return
    }

    if (formData.token0Address === formData.token1Address) {
      setError("两个代币地址不能相同")
      return
    }

    try {
      setLoading(true)
      setError("")

      const newPool = await poolApi.createPool(formData)
      onPoolCreated(newPool)
    } catch (error: any) {
      setError(error.response?.data?.message || error.message || "创建池子失败")
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
                value={formData.token0Address}
                onChange={(e) =>
                  handleInputChange("token0Address", e.target.value)
                }
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
                value={formData.token1Address}
                onChange={(e) =>
                  handleInputChange("token1Address", e.target.value)
                }
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
                value={formData.feeTier}
                onChange={(e) =>
                  handleInputChange("feeTier", parseInt(e.target.value))
                }
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value={100}>0.01% (100)</option>
                <option value={500}>0.05% (500)</option>
                <option value={3000}>0.3% (3000)</option>
                <option value={10000}>1% (10000)</option>
              </select>
            </div>

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
