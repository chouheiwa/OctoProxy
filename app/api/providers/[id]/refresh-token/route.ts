import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getProviderById, updateProvider } from '@/lib/db/providers'
import { KiroService } from '@/lib/kiro/service'

/**
 * POST /api/providers/[id]/refresh-token - 刷新 access token
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { id } = await params
    const provider = getProviderById(Number(id))
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    try {
      // 解析凭据
      let credentials: any
      try {
        credentials = typeof provider.credentials === 'string'
          ? JSON.parse(provider.credentials)
          : provider.credentials
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid credentials format' },
          { status: 400 }
        )
      }

      // 检查是否有 refreshToken
      if (!credentials.refreshToken) {
        return NextResponse.json(
          { error: 'No refresh token available' },
          { status: 400 }
        )
      }

      // 创建 KiroService 实例并刷新 token
      const kiroService = new KiroService({ ...credentials, region: provider.region })
      const newCredentials = await kiroService.refreshAccessToken()

      // 合并新旧凭据（保留其他字段）
      const updatedCredentials = {
        ...credentials,
        accessToken: newCredentials.accessToken,
        refreshToken: newCredentials.refreshToken,
        expiresAt: newCredentials.expiresAt,
      }

      // 如果有 profileArn，也更新
      if (newCredentials.profileArn) {
        updatedCredentials.profileArn = newCredentials.profileArn
      }

      // 更新数据库
      updateProvider(Number(id), {
        credentials: JSON.stringify(updatedCredentials),
      })

      return NextResponse.json({
        success: true,
        message: 'Token refreshed successfully',
        expiresAt: newCredentials.expiresAt,
      })
    } catch (e: any) {
      console.error(`[Admin] Failed to refresh token for provider ${id}:`, e)
      return NextResponse.json(
        { error: e.message || 'Failed to refresh token' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[API] Refresh token error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
