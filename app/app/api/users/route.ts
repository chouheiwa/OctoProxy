import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllUsers, createUser } from '@/lib/db/users'

/**
 * GET /api/users - 获取所有用户列表
 */
export async function GET(request: NextRequest) {
  // 验证管理员权限
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const users = getAllUsers()
    return NextResponse.json({ success: true, users })
  } catch (error: any) {
    console.error('[API] Get users error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get users' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/users - 创建新用户
 */
export async function POST(request: NextRequest) {
  // 验证管理员权限
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { username, password, role, isActive } = body

    // 验证必需字段
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // 创建用户
    const user = createUser({
      username,
      password,
      role,
      isActive,
    })

    return NextResponse.json({ success: true, user }, { status: 201 })
  } catch (error: any) {
    console.error('[API] Create user error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create user' },
      { status: 400 }
    )
  }
}
