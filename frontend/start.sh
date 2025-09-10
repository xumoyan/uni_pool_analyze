#!/bin/bash

echo "🚀 启动 Uniswap V3 流动性分析器前端界面..."

# # 检查环境变量文件
# if [ ! -f .env.local ]; then
#     echo "⚠️  未找到 .env.local 文件，请先配置环境变量"
#     echo "📝 复制 env.local 为 .env.local 并编辑配置"
#     exit 1
# fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 启动开发服务器
echo "🌟 启动开发服务器..."
npm run dev
