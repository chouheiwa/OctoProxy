# OctoProxy

中文 | [English](./README.md)

OctoProxy 是一个多账户 API 代理服务，将多种 AI 服务的能力通过标准的 OpenAI 和 Claude API 协议暴露出来，支持多账户池化管理、LRU 负载均衡、健康检查和自动故障恢复。

## 特性

- **多协议支持**: 同时支持 OpenAI 和 Claude API 格式
- **多账户池化**: 支持多个账户，自动负载均衡
- **多种选择策略**: LRU、轮询、最少/最多剩余额度优先等
- **OAuth 认证**: 支持 Google、GitHub、AWS Builder ID 登录
- **健康检查**: 自动检测账户状态，故障自动恢复
- **用量监控**: 实时查看各账户用量情况
- **Web 管理界面**: 基于 React + Ant Design 的现代化管理界面
- **多语言支持**: 支持中文和英文界面切换
- **桌面应用**: 基于 Electron 的跨平台桌面应用
- **Docker 支持**: 一键部署，支持 amd64/arm64

## 支持的模型

| 模型名称 | 说明 |
|---------|------|
| `claude-opus-4-5` | Claude Opus 4.5 |
| `claude-sonnet-4-5` | Claude Sonnet 4.5 |
| `claude-haiku-4-5` | Claude Haiku 4.5 |
| `claude-sonnet-4-20250514` | Claude Sonnet 4 |
| `claude-3-7-sonnet-20250219` | Claude 3.7 Sonnet |

## 快速开始

### 使用 Docker (推荐)

#### 方式一：直接拉取镜像（最快）

```bash
# 创建数据目录
mkdir -p data configs

# 运行容器
docker run -d \
  --name octo-proxy \
  -p 9091:9091 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs:/app/configs \
  --restart unless-stopped \
  ghcr.io/chouheiwa/octoproxy:latest
```

#### 方式二：使用 Docker Compose

```bash
# 克隆项目
git clone https://github.com/chouheiwa/OctoProxy.git
cd OctoProxy

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

#### 可用镜像标签

| 标签 | 说明 |
|------|------|
| `latest` | 最新稳定版本 |
| `v1.0.0` | 指定版本 |
| `main` | 最新 main 分支构建 |

```bash
# 拉取指定版本
docker pull ghcr.io/chouheiwa/octoproxy:v1.0.0

# 拉取最新版
docker pull ghcr.io/chouheiwa/octoproxy:latest
```

服务启动后访问 http://localhost:9091 进入管理界面。

### 手动安装

#### 环境要求

- Node.js >= 18
- npm 或 yarn

#### 安装步骤

```bash
# 克隆项目
git clone https://github.com/chouheiwa/OctoProxy.git
cd OctoProxy

# 安装后端依赖
npm install

# 安装前端依赖
cd web && npm install && cd ..

# 构建前端
cd web && npm run build && cd ..
npm run copy:static

# 启动服务
npm start
```

### 默认配置

- **端口**: 9091
- **管理员账号**: admin
- **管理员密码**: admin123
- **数据库**: data/octo-proxy.db

## 使用方法

### 1. 添加账户

1. 登录管理界面 (http://localhost:9091)
2. 进入「提供商」页面
3. 点击「通过 OAuth 添加」
4. 选择认证方式 (Google / GitHub / AWS Builder ID)
5. 完成授权流程

### 2. 创建 API 密钥

1. 进入「API 密钥」页面
2. 点击「创建 API 密钥」
3. 复制生成的密钥（仅显示一次）

### 3. 调用 API

#### OpenAI 格式

```bash
curl http://localhost:9091/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

#### Claude 格式

```bash
curl http://localhost:9091/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 集成指南

### Claude Code

在 `~/.claude/settings.json` 中添加：

```json
{
  "apiUrl": "http://localhost:9091",
  "apiKey": "YOUR_API_KEY"
}
```

### Cursor

1. 打开 Cursor 设置
2. 找到 Models 或 OpenAI 配置部分
3. 设置 API URL: `http://localhost:9091/v1`
4. 设置 API Key: `YOUR_API_KEY`

### Continue (VS Code)

在 `~/.continue/config.json` 中添加：

```json
{
  "models": [{
    "title": "OctoProxy",
    "provider": "openai",
    "model": "claude-sonnet-4-5",
    "apiBase": "http://localhost:9091/v1",
    "apiKey": "YOUR_API_KEY"
  }]
}
```

### Aider

```bash
export OPENAI_API_BASE=http://localhost:9091/v1
export OPENAI_API_KEY=YOUR_API_KEY
aider --model claude-sonnet-4-5
```

## API 端点

### 代理 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/models` | GET | 获取可用模型列表 |
| `/v1/chat/completions` | POST | OpenAI 格式聊天补全 |
| `/v1/messages` | POST | Claude 格式消息 |
| `/health` | GET | 健康检查 |

### 管理 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/login` | POST | 登录 |
| `/api/providers` | GET/POST | 提供商管理 |
| `/api/api-keys` | GET/POST | API 密钥管理 |
| `/api/users` | GET/POST | 用户管理 |
| `/api/usage` | GET | 用量查询 |
| `/api/config` | GET/PUT | 系统配置 |

## 提供商选择策略

| 策略 | 说明 |
|------|------|
| `lru` | 最近最少使用（默认，均匀分配） |
| `round_robin` | 轮询（按 ID 顺序循环） |
| `least_usage` | 最少剩余额度优先（集中消耗） |
| `most_usage` | 最多剩余额度优先（均衡消耗） |
| `oldest_first` | 最早创建优先（集中消耗） |

## 配置说明

配置文件位于 `configs/config.json`：

```json
{
  "port": 9091,
  "host": "0.0.0.0",
  "adminPassword": "admin123",
  "sessionExpireHours": 24,
  "maxErrorCount": 3,
  "healthCheckIntervalMinutes": 10,
  "retries": 3,
  "providerStrategy": "lru",
  "usageSyncIntervalMinutes": 10
}
```

## 目录结构

```
octo-proxy/
├── src/                    # 后端源代码
│   ├── index.js            # 应用入口
│   ├── server.js           # HTTP 服务器
│   ├── config.js           # 配置管理
│   ├── db/                 # 数据库层
│   ├── kiro/               # Kiro API 集成
│   ├── converters/         # 协议转换器
│   ├── middleware/         # 中间件
│   ├── routes/             # 路由处理
│   └── pool/               # 提供商池管理
├── web/                    # React 前端
├── electron/               # Electron 桌面应用
├── configs/                # 配置文件
├── data/                   # 数据库文件
├── Dockerfile              # Docker 构建文件
└── docker-compose.yml      # Docker Compose 配置
```

## 开发

### 开发模式

```bash
# 后端开发（热重载）
npm run dev

# 前端开发
cd web && npm run dev
```

### 构建 Electron 应用

```bash
# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# Linux
npm run electron:build:linux
```

## Docker 部署

### 使用预构建镜像（推荐）

```bash
# 创建数据目录
mkdir -p data configs

# 运行容器
docker run -d \
  --name octo-proxy \
  -p 9091:9091 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs:/app/configs \
  --restart unless-stopped \
  ghcr.io/chouheiwa/octoproxy:latest
```

### 使用 Docker Compose

```bash
docker-compose up -d
```

### 从源码构建

```bash
# 构建镜像
docker build -t octo-proxy .

# 运行容器
docker run -d \
  --name octo-proxy \
  -p 9091:9091 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs:/app/configs \
  --restart unless-stopped \
  octo-proxy
```

### 数据持久化

| 挂载路径 | 说明 |
|----------|------|
| `/app/data` | SQLite 数据库文件 |
| `/app/configs` | 配置文件 |

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `9091` | 服务端口 |
| `HOST` | `0.0.0.0` | 绑定地址 |
| `NODE_ENV` | `production` | 运行环境 |

## 常见问题

### Q: macOS 提示「OctoProxy 已损坏，无法打开」？

这是 macOS Gatekeeper 安全机制导致的，因为应用未经过 Apple 开发者证书签名。

**方法一：使用修复脚本（推荐）**

双击 DMG 中的 `Fix Gatekeeper.command`，它会自动修复问题并打开应用。

**方法二：手动执行命令**

```bash
xattr -cr /Applications/OctoProxy.app
```

**方法三：右键打开**

右键点击应用 → 打开 → 打开（仅首次需要）。

### Q: 如何重置管理员密码？

删除 `configs/config.json` 文件后重启服务，将使用默认密码 `admin123`。

### Q: 账户显示不健康怎么办？

1. 检查账户是否已过期或被禁用
2. 尝试手动点击「检查」按钮
3. 查看错误信息，根据提示处理

### Q: 如何查看 API 调用日志？

在 `configs/config.json` 中设置 `"debug": true`，重启服务后将输出详细日志。

### Q: 支持流式输出吗？

支持。在请求中设置 `"stream": true` 即可启用流式输出。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
