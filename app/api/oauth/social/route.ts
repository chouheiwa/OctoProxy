import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { startSocialAuth } from '@/lib/kiro/oauth'

/**
 * POST /api/oauth/social - 启动 Social Auth (Google/GitHub)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { provider, region } = body

    if (!provider || !['google', 'github'].includes(provider)) {
      return NextResponse.json(
        { error: 'Provider must be "google" or "github"' },
        { status: 400 }
      )
    }

    try {
      const result = await startSocialAuth(provider, region || 'us-east-1')
      return NextResponse.json({
        success: true,
        sessionId: result.sessionId,
        authUrl: result.authUrl,
        state: result.state,
        message: 'Please open the authUrl in a browser to complete authentication',
      })
    } catch (error: any) {
      console.error('[OAuth] Start social auth error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } catch (error: any) {
    console.error('[API] OAuth social error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
