import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/db/sessions'

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session_token')?.value

    if (sessionToken) {
      // 删除 session
      deleteSession(sessionToken)
    }

    // 清除 cookie
    const response = NextResponse.json({ success: true })
    response.cookies.delete('session_token')

    return response
  } catch (error: any) {
    console.error('[API] Logout error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
