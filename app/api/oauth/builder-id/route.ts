import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { startBuilderIDAuth } from '@/lib/kiro/oauth'

/**
 * POST /api/oauth/builder-id - 启动 Builder ID 认证
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { region } = body

    try {
      const result = await startBuilderIDAuth(region || 'us-east-1')
      return NextResponse.json({
        success: true,
        sessionId: result.sessionId,
        authUrl: result.authUrl,
        userCode: result.userCode,
        expiresIn: result.expiresIn,
        message: 'Please open the authUrl and enter the userCode to complete authentication',
      })
    } catch (error: any) {
      console.error('[OAuth] Start builder ID auth error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } catch (error: any) {
    console.error('[API] OAuth builder-id error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
