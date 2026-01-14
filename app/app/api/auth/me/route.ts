import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession } from '@/lib/middleware/auth'

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSession(request)

    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: auth.user!.id,
        username: auth.user!.username,
        role: auth.user!.role,
        is_active: auth.user!.is_active,
      },
    })
  } catch (error: any) {
    console.error('[API] Get current user error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
