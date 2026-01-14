import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession, authenticateAdmin } from '@/lib/middleware/auth'
import { getAllApiKeys, createApiKey } from '@/lib/db/api-keys'

/**
 * GET /api/api-keys - 获取所有 API Keys
 * 管理员可以看所有，普通用户只能看自己的
 */
export async function GET(request: NextRequest) {
  // 验证 session
  const auth = await authenticateSession(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    let apiKeys = getAllApiKeys()

    // 管理员可以看所有，普通用户只能看自己的
    if (auth.user?.role !== 'admin') {
      apiKeys = apiKeys.filter((k) => k.user_id === auth.user?.id)
    }

    return NextResponse.json({ success: true, apiKeys })
  } catch (error: any) {
    console.error('[API] Get API keys error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get API keys' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/api-keys - 创建新 API Key
 * 返回明文 key（只有创建时返回一次）
 */
export async function POST(request: NextRequest) {
  // 验证 session
  const auth = await authenticateSession(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, dailyLimit, userId } = body

    // 普通用户只能为自己创建
    const targetUserId =
      auth.user?.role === 'admin'
        ? userId || auth.user.id
        : auth.user!.id

    // 创建 API Key
    const apiKey = createApiKey({
      name,
      dailyLimit,
      userId: targetUserId,
    })

    // 返回包含明文 key 的完整对象（仅在创建时）
    return NextResponse.json({ success: true, apiKey }, { status: 201 })
  } catch (error: any) {
    console.error('[API] Create API key error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create API key' },
      { status: 400 }
    )
  }
}
