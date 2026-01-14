# OAuth API 快速参考

## 5 个端点概览

| 端点 | 方法 | 功能 | 认证 |
|------|------|------|------|
| `/api/oauth/social` | POST | 启动 Google/GitHub 认证 | Admin |
| `/api/oauth/builder-id` | POST | 启动 AWS Builder ID 认证 | Admin |
| `/api/oauth/session/{id}` | GET | 查询会话状态 | Admin |
| `/api/oauth/session/{id}` | DELETE | 取消会话 | Admin |
| `/api/oauth/complete` | POST | 完成认证并创建提供商 | Admin |

---

## 快速示例

### 1. Google 认证 (3 步)

```typescript
// Step 1: 启动
const { sessionId, authUrl } = await fetch('/api/oauth/social', {
  method: 'POST',
  body: JSON.stringify({ provider: 'google' })
}).then(r => r.json())

// Step 2: 打开浏览器
window.open(authUrl, '_blank')

// Step 3: 完成
await fetch('/api/oauth/complete', {
  method: 'POST',
  body: JSON.stringify({ sessionId })
})
```

### 2. Builder ID 认证 (4 步)

```typescript
// Step 1: 启动
const { sessionId, authUrl, userCode } = await fetch('/api/oauth/builder-id', {
  method: 'POST',
  body: JSON.stringify({ region: 'us-east-1' })
}).then(r => r.json())

// Step 2: 显示用户代码
alert(`访问 ${authUrl} 并输入: ${userCode}`)

// Step 3: 轮询状态
const interval = setInterval(async () => {
  const { session } = await fetch(`/api/oauth/session/${sessionId}`).then(r => r.json())
  if (session.status === 'completed') {
    clearInterval(interval)
    // Step 4: 完成
    await fetch('/api/oauth/complete', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    })
  }
}, 3000)
```

### 3. 取消认证

```typescript
await fetch(`/api/oauth/session/${sessionId}`, {
  method: 'DELETE'
})
```

---

## 请求/响应参考

### POST /api/oauth/social

```typescript
// Request
{ provider: 'google' | 'github', region?: string }

// Response
{ success: true, sessionId: string, authUrl: string, state: string, message: string }
```

### POST /api/oauth/builder-id

```typescript
// Request
{ region?: string }

// Response
{ success: true, sessionId: string, authUrl: string, userCode: string, expiresIn: number, message: string }
```

### GET /api/oauth/session/{sessionId}

```typescript
// Response
{
  success: true,
  session: {
    sessionId: string,
    type: 'social' | 'builder-id',
    status: 'pending' | 'completed' | 'error' | 'expired' | 'cancelled',
    provider?: 'google' | 'github',
    userCode?: string,
    error?: string
  }
}
```

### DELETE /api/oauth/session/{sessionId}

```typescript
// Response
{ success: true, message: 'OAuth session cancelled' }
```

### POST /api/oauth/complete

```typescript
// Request
{
  sessionId: string,
  name?: string,
  checkHealth?: boolean,
  checkModelName?: string,
  timeout?: number
}

// Response
{
  success: true,
  provider: {
    id: number,
    uuid: string,
    name: string,
    region: string,
    is_healthy: number,
    // ... (credentials 已移除)
  },
  message: string
}
```

---

## 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 参数错误 (缺少必填字段、provider 无效等) |
| 401 | 未授权 (需要管理员权限) |
| 404 | 会话不存在 |
| 500 | 服务器错误 (OAuth 失败、超时、数据库错误等) |

---

## 常见错误

| 错误信息 | 解决方案 |
|----------|----------|
| `Provider must be "google" or "github"` | 检查 provider 参数 |
| `sessionId is required` | 添加 sessionId 字段 |
| `OAuth session not found` | 会话已过期,重新开始 |
| `Authentication timeout` | 增加 timeout 或重试 |
| `Failed to create provider` | 检查数据库和凭据 |

---

## 安全提示

1. ✅ 所有端点需要管理员权限
2. ✅ 凭据永不返回到客户端
3. ✅ 会话有过期时间 (Builder ID: 15 分钟)
4. ✅ 使用 HTTPS (生产环境)
5. ✅ 本地回调端口: 19876-19880

---

## 文件位置

```
app/api/oauth/
├── social/route.ts          # Google/GitHub
├── builder-id/route.ts      # AWS Builder ID
├── complete/route.ts        # 完成认证
└── session/[sessionId]/
    └── route.ts             # 查询/取消
```

---

## 相关模块

- **OAuth**: `@/lib/kiro/oauth`
- **认证**: `@/lib/middleware/auth`
- **数据库**: `@/lib/db/providers`

---

## 更多信息

📄 **完整文档**: `app/api/oauth/README.md`
📄 **迁移总结**: `OAUTH_MIGRATION_SUMMARY.md`
