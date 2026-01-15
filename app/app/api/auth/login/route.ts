import { NextRequest, NextResponse } from 'next/server'
import { ensureDatabase } from '@/lib/db'
import { authenticateUser } from '@/lib/db/users'
import { createSession } from '@/lib/db/sessions'

export async function POST(request: NextRequest) {
  try {
    // 确保数据库已初始化（sql.js 需要异步加载 WASM）
    await ensureDatabase()

    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // 验证用户
    const user = authenticateUser(username, password)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // 创建 session (24小时有效期)
    const { token: sessionToken, expiresAt: expiresAtISO } = createSession(user.id, 24)
    const expiresAt = new Date(expiresAtISO)

    // 设置 cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    })

    response.cookies.set('session_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: expiresAt,
    })

    return response
  } catch (error: any) {
    console.error('[API] Login error:', error?.message || error, error?.stack)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
