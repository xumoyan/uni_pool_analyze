#!/bin/bash

echo "🚀 启动 Uniswap V3 流动性分析器后端服务..."

# 检查环境变量文件
if [ ! -f .env ]; then
    echo "⚠️  未找到 .env 文件，请先配置环境变量"
    echo "📝 复制 env.example 为 .env 并编辑配置"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 构建项目
echo "🔨 构建项目..."
npm run build

# 启动服务
echo "🌟 启动服务..."
npm run start:prod
