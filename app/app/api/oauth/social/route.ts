import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { startSocialAuth } from '@/lib/kiro/oauth'

// 禁用 Next.js 路由缓存
export const dynamic = 'force-dynamic'

/**
 * POST /api/oauth/social - 启动 Social OAuth 认证流程
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { provider, region = 'us-east-1' } = body

    if (!provider || !['google', 'github'].includes(provider)) {
      return NextResponse.json(
        { success: false, error: 'Invalid provider. Must be "google" or "github"' },
        { status: 400 }
      )
    }

    const session = await startSocialAuth(provider, region)

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      authUrl: session.authUrl,
      state: session.state,
    })
  } catch (error: any) {
    console.error('[API] Start social auth error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to start OAuth' },
      { status: 500 }
    )
  }
}
