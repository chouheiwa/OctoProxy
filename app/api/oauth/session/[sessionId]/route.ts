import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getSessionStatus, cancelSession } from '@/lib/kiro/oauth'

/**
 * GET /api/oauth/session/[sessionId] - 获取 OAuth 会话状态
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const sessionId = params.sessionId
    const status = getSessionStatus(sessionId)

    if (!status) {
      return NextResponse.json(
        { error: 'OAuth session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, session: status })
  } catch (error: any) {
    console.error('[API] Get OAuth session status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/oauth/session/[sessionId] - 取消 OAuth 会话
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const sessionId = params.sessionId
    const cancelled = cancelSession(sessionId)

    if (!cancelled) {
      return NextResponse.json(
        { error: 'OAuth session not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'OAuth session cancelled',
    })
  } catch (error: any) {
    console.error('[API] Cancel OAuth session error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
