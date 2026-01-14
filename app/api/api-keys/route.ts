import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession } from '@/lib/middleware/auth'
import { getAllApiKeys, createApiKey } from '@/lib/db/api-keys'

/**
 * GET /api/api-keys - 获取 API Keys
 * 管理员可以看所有，普通用户只能看自己的
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateSession(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    let apiKeys = getAllApiKeys()

    // 普通用户只能看自己的
    if (auth.user?.role !== 'admin') {
      apiKeys = apiKeys.filter((k) => k.user_id === auth.session?.user_id)
    }

    return NextResponse.json({ success: true, apiKeys })
  } catch (error: any) {
    console.error('[API] Get API keys error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/api-keys - 创建 API Key
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateSession(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { name, dailyLimit, userId } = body

    // 普通用户只能为自己创建
    const targetUserId =
      auth.user?.role === 'admin'
        ? userId || auth.session?.user_id
        : auth.session?.user_id

    const apiKey = createApiKey({
      name,
      dailyLimit,
      userId: targetUserId,
    })

    return NextResponse.json({ success: true, apiKey })
  } catch (error: any) {
    console.error('[API] Create API key error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
