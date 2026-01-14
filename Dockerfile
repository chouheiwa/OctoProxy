# 阶段1: 构建 Next.js 应用
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建 better-sqlite3 所需的依赖
RUN apk add --no-cache python3 make g++

# 复制 Next.js 应用依赖文件
COPY app/package*.json ./

# 安装依赖
RUN npm ci

# 复制 Next.js 应用源代码
COPY app/ ./

# 构建 Next.js 应用
RUN npm run build

# 阶段2: 生产镜像
FROM node:20-alpine AS production

WORKDIR /app

# 安装运行时依赖 (better-sqlite3 需要)
RUN apk add --no-cache libstdc++

# 复制构建产物和依赖
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 复制数据库迁移文件
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations

# 创建数据和配置目录
RUN mkdir -p /app/data /app/configs

# 设置环境变量
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=12000

# 暴露端口
EXPOSE 12000

# 数据卷
VOLUME ["/app/data", "/app/configs"]

# 启动命令
CMD ["node", "server.js"]
