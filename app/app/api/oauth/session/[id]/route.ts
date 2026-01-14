import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getOAuthSession, cancelOAuthSession } from '@/lib/kiro/oauth'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/oauth/session/[id] - 获取 OAuth 会话状态
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const { id: sessionId } = await params

  try {
    const session = getOAuthSession(sessionId)
    if (!session) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      id: session.id,
      status: session.status,
      provider: session.provider,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      error: session.error,
    })
  } catch (error: any) {
    console.error('[API] Get OAuth session error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get session' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/oauth/session/[id] - 取消 OAuth 会话
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const { id: sessionId } = await params

  try {
    const success = cancelOAuthSession(sessionId)
    if (!success) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Session cancelled' })
  } catch (error: any) {
    console.error('[API] Cancel OAuth session error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to cancel session' },
      { status: 500 }
    )
  }
}
