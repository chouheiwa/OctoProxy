import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { completeOAuth } from '@/lib/kiro/oauth'

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
    const { sessionId } = body

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      )
    }

    const result = await completeOAuth(sessionId)

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[API] Complete OAuth error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to complete OAuth' },
      { status: 500 }
    )
  }
}
