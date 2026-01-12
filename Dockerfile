# 阶段1: 构建前端
FROM node:20-alpine AS frontend-builder

WORKDIR /app/web

# 复制前端依赖文件
COPY web/package*.json ./

# 安装前端依赖
RUN npm ci

# 复制前端源代码
COPY web/ ./

# 构建前端
RUN npm run build

# 阶段2: 构建后端
FROM node:20-alpine AS backend-builder

WORKDIR /app

# 安装构建 better-sqlite3 所需的依赖
RUN apk add --no-cache python3 make g++

# 复制后端依赖文件
COPY package*.json ./

# 安装后端依赖 (跳过 postinstall 脚本以避免 electron-builder 错误，然后手动重建原生模块)
RUN npm ci --only=production --ignore-scripts && npm rebuild better-sqlite3

# 阶段3: 生产镜像
FROM node:20-alpine AS production

WORKDIR /app

# 安装运行时依赖 (better-sqlite3 需要)
RUN apk add --no-cache libstdc++

# 从 backend-builder 复制 node_modules
COPY --from=backend-builder /app/node_modules ./node_modules

# 复制后端源代码
COPY src/ ./src/
COPY package.json ./

# 从 frontend-builder 复制构建产物
COPY --from=frontend-builder /app/web/dist ./static

# 创建数据和配置目录
RUN mkdir -p /app/data /app/configs

# 设置环境变量
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=9091

# 暴露端口
EXPOSE 9091

# 数据卷
VOLUME ["/app/data", "/app/configs"]

# 启动命令
CMD ["node", "src/index.js"]
