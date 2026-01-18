import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getSessionStatus } from '@/lib/kiro/oauth'
import { createProvider } from '@/lib/db/providers'

// 禁用 Next.js 路由缓存
export const dynamic = 'force-dynamic'

/**
 * POST /api/oauth/complete - 完成 OAuth 认证流程
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { sessionId, name, checkHealth = true } = body

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // 获取 OAuth 会话状态
    const session = getSessionStatus(sessionId)
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      )
    }

    if (session.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: `Session not completed, status: ${session.status}` },
        { status: 400 }
      )
    }

    if (!session.credentials) {
      return NextResponse.json(
        { success: false, error: 'No credentials found in session' },
        { status: 400 }
      )
    }

    // 创建 Provider
    const provider = createProvider({
      name: name || `OAuth Provider`,
      region: session.credentials.region || 'us-east-1',
      credentials: session.credentials,
      checkHealth,
    })

    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'Failed to create provider' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      provider: {
        id: provider.id,
        uuid: provider.uuid,
        name: provider.name,
        region: provider.region,
      },
    })
  } catch (error: any) {
    console.error('[API] Complete OAuth error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to complete OAuth' },
      { status: 500 }
    )
  }
}
