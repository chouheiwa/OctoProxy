import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllProviders, createProvider } from '@/lib/db/providers'

/**
 * GET /api/providers - 获取所有提供商
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const providers = getAllProviders()

    // 安全过滤：不返回 credentials 字段
    const safeProviders = providers.map((p: any) => {
      const { credentials, ...safe } = p
      return safe
    })

    return NextResponse.json({ success: true, providers: safeProviders })
  } catch (error: any) {
    console.error('[API] Get providers error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/providers - 创建提供商
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { name, region, credentials, checkHealth, checkModelName } = body

    if (!credentials) {
      return NextResponse.json(
        { error: 'Credentials are required' },
        { status: 400 }
      )
    }

    try {
      // 序列化 credentials
      const credentialsStr = typeof credentials === 'string'
        ? credentials
        : JSON.stringify(credentials)

      const provider = createProvider({
        name,
        region,
        credentials: credentialsStr,
        checkHealth,
        checkModelName,
      })

      if (!provider) {
        return NextResponse.json(
          { error: 'Failed to create provider' },
          { status: 500 }
        )
      }

      // 安全过滤：不返回 credentials
      const { credentials: _, ...safe } = provider
      return NextResponse.json({ success: true, provider: safe })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[API] Create provider error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
