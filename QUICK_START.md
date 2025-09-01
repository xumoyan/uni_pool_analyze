# 快速启动指南

## 🚀 一键启动（推荐）

```bash
# 确保 Docker 已启动
./start.sh
```

这将自动启动：
- PostgreSQL 数据库
- 后端服务 (NestJS)
- 前端界面 (Next.js)

## 🔧 手动启动

### 1. 启动数据库
```bash
docker run -d \
    --name uniswap-v3-postgres \
    -e POSTGRES_DB=uniswap_v3_analyzer \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=password \
    -p 5432:5432 \
    postgres:13
```

### 2. 配置环境变量
```bash
# 后端配置
cd backend
cp env.example .env
# 编辑 .env 文件，配置数据库和 RPC 信息

# 前端配置
cd ../frontend
cp env.local .env.local
# 编辑 .env.local 文件，配置 API 地址
```

### 3. 启动后端
```bash
cd backend
npm install
npm run start:dev
```

### 4. 启动前端
```bash
cd frontend
npm install
npm run dev
```

## 🌐 访问地址

- **前端界面**: http://localhost:3000
- **后端API**: http://localhost:3001
- **数据库**: localhost:5432

## 📝 首次使用

1. 打开前端界面
2. 点击"添加池子"
3. 输入代币地址和费率
4. 系统自动开始监控流动性数据

## 🛑 停止服务

按 `Ctrl+C` 停止所有服务，或运行：

```bash
docker stop uniswap-v3-postgres
docker rm uniswap-v3-postgres
```
