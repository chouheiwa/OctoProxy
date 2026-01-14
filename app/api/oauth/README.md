# OAuth 认证 API 文档

## 概述

这些端点用于通过 OAuth 流程添加新的 Kiro 提供商。支持三种认证方式:
- **Google** (Social Auth)
- **GitHub** (Social Auth)
- **AWS Builder ID** (设备授权流程)

所有端点都需要管理员权限 (`authenticateAdmin`)。

## API 端点

### 1. POST /api/oauth/social

启动 Social Auth 流程 (Google/GitHub)。

**请求体:**
```json
{
  "provider": "google",  // 或 "github"
  "region": "us-east-1"  // 可选,默认 "us-east-1"
}
```

**响应 (200):**
```json
{
  "success": true,
  "sessionId": "abc-123-def-456",
  "authUrl": "https://prod.us-east-1.auth.desktop.kiro.dev/login?...",
  "state": "random-state-token",
  "message": "Please open the authUrl in a browser to complete authentication"
}
```

**错误响应:**
- `400`: Provider 必须是 "google" 或 "github"
- `401`: 未授权 (需要管理员权限)
- `500`: OAuth 流程启动失败

**使用流程:**
1. 调用此端点获取 `authUrl` 和 `sessionId`
2. 在浏览器中打开 `authUrl` 完成登录
3. 使用 `sessionId` 调用 `/api/oauth/session/{sessionId}` 轮询状态
4. 状态变为 "completed" 后,调用 `/api/oauth/complete` 创建提供商

---

### 2. POST /api/oauth/builder-id

启动 AWS Builder ID 设备授权流程。

**请求体:**
```json
{
  "region": "us-east-1"  // 可选,默认 "us-east-1"
}
```

**响应 (200):**
```json
{
  "success": true,
  "sessionId": "def-456-ghi-789",
  "authUrl": "https://device.sso.us-east-1.amazonaws.com/?user_code=ABCD-EFGH",
  "userCode": "ABCD-EFGH",
  "expiresIn": 900,
  "message": "Please open the authUrl and enter the userCode to complete authentication"
}
```

**错误响应:**
- `401`: 未授权 (需要管理员权限)
- `500`: Builder ID 认证启动失败

**使用流程:**
1. 调用此端点获取 `authUrl`、`userCode` 和 `sessionId`
2. 在浏览器中打开 `authUrl` 并输入 `userCode`
3. 使用 `sessionId` 调用 `/api/oauth/session/{sessionId}` 轮询状态
4. 状态变为 "completed" 后,调用 `/api/oauth/complete` 创建提供商

---

### 3. GET /api/oauth/session/{sessionId}

获取 OAuth 会话的当前状态。

**路径参数:**
- `sessionId`: OAuth 会话 ID (从 `/oauth/social` 或 `/oauth/builder-id` 获取)

**响应 (200):**
```json
{
  "success": true,
  "session": {
    "sessionId": "abc-123-def-456",
    "type": "social",           // 或 "builder-id"
    "status": "pending",        // pending/completed/error/expired/cancelled
    "provider": "google",       // Social Auth 时存在
    "userCode": "ABCD-EFGH",   // Builder ID 时存在
    "error": null,              // 错误时包含错误信息
    "credentials": {...}        // 仅在 status="completed" 时存在
  }
}
```

**会话状态说明:**
- `pending`: 等待用户完成认证
- `completed`: 认证成功,可以创建提供商
- `error`: 认证失败
- `expired`: 会话过期 (Builder ID 通常 15 分钟)
- `timeout`: 等待超时
- `cancelled`: 已取消

**错误响应:**
- `401`: 未授权 (需要管理员权限)
- `404`: OAuth 会话不存在

**使用建议:**
- 使用轮询 (每 3-5 秒) 检查状态,直到 `status !== "pending"`
- 前端示例: `setInterval(() => checkStatus(sessionId), 3000)`

---

### 4. DELETE /api/oauth/session/{sessionId}

取消 OAuth 会话。

**路径参数:**
- `sessionId`: OAuth 会话 ID

**响应 (200):**
```json
{
  "success": true,
  "message": "OAuth session cancelled"
}
```

**错误响应:**
- `401`: 未授权 (需要管理员权限)
- `404`: OAuth 会话不存在或已完成/过期

**使用场景:**
- 用户关闭认证窗口
- 用户点击"取消"按钮
- 超时或不再需要此会话

---

### 5. POST /api/oauth/complete

等待 OAuth 完成并创建提供商。

**请求体:**
```json
{
  "sessionId": "abc-123-def-456",       // 必填
  "name": "My Google Provider",         // 可选,默认自动生成
  "checkHealth": true,                  // 可选,默认 true
  "checkModelName": "claude-sonnet-4-5", // 可选,健康检查使用的模型
  "timeout": 300000                     // 可选,等待超时(毫秒),默认 5 分钟
}
```

**响应 (200):**
```json
{
  "success": true,
  "provider": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Google Provider",
    "region": "us-east-1",
    "is_healthy": 1,
    "is_disabled": 0,
    "error_count": 0,
    "created_at": "2026-01-14T10:30:00.000Z",
    // 注意: credentials 字段已被移除 (安全)
  },
  "message": "OAuth authentication completed and provider created"
}
```

**错误响应:**
- `400`: sessionId 缺失
- `401`: 未授权 (需要管理员权限)
- `500`: 认证超时、会话不存在、或创建提供商失败

**重要说明:**
- 此端点会**阻塞等待**认证完成,可能需要几分钟
- 前端应显示加载状态
- 如果用户已完成认证,会立即返回
- 超时后抛出错误,需要重新开始流程

---

## 完整使用示例

### Google 认证流程 (前端 React 示例)

```typescript
// 1. 启动 Social Auth
async function startGoogleAuth() {
  const res = await fetch('/api/oauth/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'google' })
  })
  const data = await res.json()

  if (!data.success) throw new Error(data.error)

  // 打开认证窗口
  window.open(data.authUrl, '_blank', 'width=600,height=700')

  return data.sessionId
}

// 2. 轮询会话状态
async function pollSessionStatus(sessionId: string) {
  const pollInterval = setInterval(async () => {
    const res = await fetch(`/api/oauth/session/${sessionId}`)
    const data = await res.json()

    if (data.session.status === 'completed') {
      clearInterval(pollInterval)
      await completeAuth(sessionId)
    } else if (data.session.status !== 'pending') {
      clearInterval(pollInterval)
      console.error('Auth failed:', data.session.error)
    }
  }, 3000)
}

// 3. 完成认证并创建提供商
async function completeAuth(sessionId: string) {
  setLoading(true)

  const res = await fetch('/api/oauth/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      name: 'My Google Account',
      checkHealth: true
    })
  })

  const data = await res.json()
  setLoading(false)

  if (data.success) {
    console.log('Provider created:', data.provider)
    // 刷新提供商列表
  }
}

// 组合流程
async function handleGoogleAuth() {
  try {
    const sessionId = await startGoogleAuth()
    await pollSessionStatus(sessionId)
  } catch (error) {
    console.error('OAuth failed:', error)
  }
}
```

### Builder ID 认证流程

```typescript
async function startBuilderIDAuth() {
  const res = await fetch('/api/oauth/builder-id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ region: 'us-east-1' })
  })
  const data = await res.json()

  if (!data.success) throw new Error(data.error)

  // 显示用户代码
  alert(`请访问 ${data.authUrl} 并输入代码: ${data.userCode}`)

  // 开始轮询
  pollSessionStatus(data.sessionId)
}
```

### 取消认证

```typescript
async function cancelAuth(sessionId: string) {
  await fetch(`/api/oauth/session/${sessionId}`, {
    method: 'DELETE'
  })
  console.log('OAuth cancelled')
}
```

---

## 安全注意事项

1. **所有端点都需要管理员权限** - 确保用户已登录且角色为 `admin`
2. **凭据不会在响应中返回** - `createProvider` 返回的对象已移除 `credentials` 字段
3. **会话有过期时间** - Builder ID 会话通常 15 分钟后过期
4. **使用 HTTPS** - 生产环境必须使用 HTTPS 保护 OAuth 流程
5. **本地回调服务器** - Social Auth 需要本地端口 19876-19880,确保防火墙允许

---

## 错误处理

常见错误及解决方案:

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `No available port for OAuth callback server` | 端口被占用 | 释放端口或重启服务 |
| `Session not found` | 会话不存在或已过期 | 重新开始 OAuth 流程 |
| `Authentication timeout` | 等待超时 | 增加 `timeout` 参数或重试 |
| `Token exchange failed` | 授权码无效 | 检查用户是否完成认证 |
| `Failed to create provider` | 数据库错误 | 检查数据库连接和配置 |

---

## 技术细节

### Social Auth (PKCE 流程)

1. 生成 `code_verifier` 和 `code_challenge`
2. 构建授权 URL (包含 `state`, `redirect_uri`, `code_challenge`)
3. 启动本地回调服务器 (127.0.0.1:19876-19880)
4. 用户登录后重定向到回调服务器
5. 使用 `code` 和 `code_verifier` 交换 access token

### Builder ID (设备授权流程)

1. 注册 OIDC 客户端
2. 启动设备授权,获取 `device_code` 和 `user_code`
3. 用户在浏览器中输入 `user_code`
4. 后台轮询 token 端点 (每 5 秒)
5. 用户批准后获取 access token

### 会话管理

- 会话存储在内存 Map 中 (`activeSessions`)
- 自动清理 10 分钟以上的旧会话 (`cleanupSessions`)
- 支持多个并发会话

---

## 相关模块

- **OAuth 模块**: `/app/lib/kiro/oauth.ts`
- **认证中间件**: `/app/lib/middleware/auth.ts`
- **提供商数据库**: `/app/lib/db/providers.ts`
- **原始实现**: `/src/routes/admin.js` (第 830-979 行)
