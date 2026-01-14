import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { startBuilderIdAuth } from '@/lib/kiro/oauth'

/**
 * POST /api/oauth/builder-id - 启动 AWS Builder ID 认证流程
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { region = 'us-east-1' } = body

    const session = await startBuilderIdAuth(region)

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      userCode: session.userCode,
      verificationUri: session.verificationUri,
      verificationUriComplete: session.verificationUriComplete,
      expiresIn: session.expiresIn,
      interval: session.interval,
    })
  } catch (error: any) {
    console.error('[API] Start builder ID auth error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to start Builder ID auth' },
      { status: 500 }
    )
  }
}
