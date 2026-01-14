# 阶段1: 构建 Next.js 应用
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建 better-sqlite3 所需的依赖
RUN apk add --no-cache python3 make g++

# 复制依赖文件并安装
COPY app/package*.json ./
RUN npm ci

# 复制源代码并构建
COPY app/ ./
RUN npm run build

# 阶段2: 生产镜像 (最小化)
FROM node:20-alpine

WORKDIR /app

# better-sqlite3 运行时依赖
RUN apk add --no-cache libstdc++ \
    && mkdir -p /app/data /app/configs

# 复制 standalone 构建产物 (已包含精简的 node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=12000

EXPOSE 12000
VOLUME ["/app/data", "/app/configs"]

CMD ["node", "server.js"]
