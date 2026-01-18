import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllProviders, createProvider } from '@/lib/db/providers'

// 禁用路由缓存，确保每次请求都获取最新数据
export const dynamic = 'force-dynamic'

/**
 * GET /api/providers - 获取所有提供商列表
 */
export async function GET(request: NextRequest) {
  // 验证管理员权限
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const providers = getAllProviders()

    // 不返回凭据信息
    const safeProviders = providers.map((p) => {
      const { credentials, ...safe } = p
      return safe
    })

    return NextResponse.json({ success: true, providers: safeProviders })
  } catch (error: any) {
    console.error('[API] Get providers error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get providers' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/providers - 创建新提供商
 */
export async function POST(request: NextRequest) {
  // 验证管理员权限
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, region, credentials, checkHealth, checkModelName } = body

    // 验证必需字段
    if (!credentials) {
      return NextResponse.json(
        { success: false, error: 'Credentials are required' },
        { status: 400 }
      )
    }

    // 创建提供商
    const provider = createProvider({
      name,
      region,
      credentials:
        typeof credentials === 'string'
          ? credentials
          : JSON.stringify(credentials),
      checkHealth,
      checkModelName,
    })

    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'Failed to create provider' },
        { status: 500 }
      )
    }

    // 不返回凭据信息
    const { credentials: _, ...safeProvider } = provider

    return NextResponse.json({ success: true, provider: safeProvider }, { status: 201 })
  } catch (error: any) {
    console.error('[API] Create provider error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create provider' },
      { status: 400 }
    )
  }
}
