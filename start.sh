#!/bin/bash

echo "🚀 启动 Uniswap V3 流动性分析器项目..."
echo "=================================="

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "⚠️  Docker 未运行，请先启动 Docker"
    exit 1
fi

# 启动 PostgreSQL 数据库
echo "🗄️  启动 PostgreSQL 数据库..."
docker run -d \
    --name uniswap-v3-postgres \
    -e POSTGRES_DB=uniswap_v3_analyzer \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=password \
    -p 5432:5432 \
    postgres:13

echo "⏳ 等待数据库启动..."
sleep 10

# 启动后端服务
echo "🔧 启动后端服务..."
cd backend
./start.sh &
BACKEND_PID=$!
cd ..

# 等待后端启动
echo "⏳ 等待后端服务启动..."
sleep 15

# 启动前端服务
echo "🎨 启动前端界面..."
cd frontend
./start.sh &
FRONTEND_PID=$!
cd ..

echo "=================================="
echo "✅ 所有服务已启动！"
echo ""
echo "📊 后端服务: http://localhost:3001"
echo "🎨 前端界面: http://localhost:3000"
echo "🗄️  数据库: localhost:5432"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
trap "echo '🛑 停止所有服务...'; kill $BACKEND_PID $FRONTEND_PID; docker stop uniswap-v3-postgres; docker rm uniswap-v3-postgres; exit" INT

wait
