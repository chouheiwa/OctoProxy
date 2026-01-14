import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllUsers, createUser } from '@/lib/db/users'

/**
 * GET /api/users - 获取所有用户
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const users = getAllUsers()
    return NextResponse.json({ success: true, users })
  } catch (error: any) {
    console.error('[API] Get users error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/users - 创建用户
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { username, password, role, isActive } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    try {
      const user = createUser({ username, password, role, isActive })
      return NextResponse.json({ success: true, user })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[API] Create user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
