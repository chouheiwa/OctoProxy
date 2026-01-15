import { NextRequest } from 'next/server'
import { ensureDatabase } from '@/lib/db'
import { getSessionByToken } from '@/lib/db/sessions'
import { getUserById } from '@/lib/db/users'
import type { SafeUser } from '@/lib/db/users'
import type { Session } from '@/lib/db/sessions'

export interface AuthResult {
  success: boolean
  user?: SafeUser
  session?: Session
  error?: string
}

/**
 * 验证 session 令牌
 */
export async function authenticateSession(request: NextRequest): Promise<AuthResult> {
  // 确保数据库已初始化
  await ensureDatabase()

  const sessionToken = request.cookies.get('session_token')?.value

  if (!sessionToken) {
    return { success: false, error: 'No session token' }
  }

  const session = getSessionByToken(sessionToken)
  if (!session) {
    return { success: false, error: 'Invalid session' }
  }

  if (new Date(session.expires_at) < new Date()) {
    return { success: false, error: 'Session expired' }
  }

  const user = getUserById(session.user_id)
  if (!user) {
    return { success: false, error: 'User not found' }
  }

  if (!user.is_active) {
    return { success: false, error: 'User is inactive' }
  }

  return { success: true, user, session }
}

/**
 * 验证管理员权限
 */
export async function authenticateAdmin(request: NextRequest): Promise<AuthResult> {
  const auth = await authenticateSession(request)
  if (!auth.success) {
    return auth
  }

  if (auth.user?.role !== 'admin') {
    return { success: false, error: 'Admin access required' }
  }

  return auth
}

/**
 * API Key 认证结果接口
 */
export interface ApiKeyAuthResult {
  success: boolean
  apiKey?: any
  error?: string
}

/**
 * 从请求中提取 API Key
 */
export function extractApiKeyFromRequest(request: NextRequest): string | null {
  // 1. 从 Authorization header 提取 (Bearer token)
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const parts = authHeader.split(' ')
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1]
    }
  }

  // 2. 从 x-api-key header 提取
  const xApiKey = request.headers.get('x-api-key')
  if (xApiKey) {
    return xApiKey
  }

  // 3. 从 query 参数提取
  const url = new URL(request.url)
  const apiKeyParam = url.searchParams.get('api_key')
  if (apiKeyParam) {
    return apiKeyParam
  }

  return null
}

/**
 * 验证 API Key
 */
export async function authenticateApiKey(request: NextRequest): Promise<ApiKeyAuthResult> {
  // 确保数据库已初始化
  await ensureDatabase()

  const key = extractApiKeyFromRequest(request)

  if (!key) {
    return {
      success: false,
      error: 'Missing API key. Please provide an API key via Authorization header or x-api-key header.'
    }
  }

  // 使用 db/api-keys 中的验证函数
  const { validateApiKey } = require('@/lib/db/api-keys')
  const apiKey = validateApiKey(key)

  if (!apiKey) {
    return {
      success: false,
      error: 'Invalid API key.'
    }
  }

  if (apiKey.exceeded) {
    return {
      success: false,
      error: 'API key daily limit exceeded.'
    }
  }

  return {
    success: true,
    apiKey
  }
}
