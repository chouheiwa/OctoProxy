import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getProviderById } from '@/lib/db/providers'
import { checkProviderHealth } from '@/lib/pool/manager'

/**
 * POST /api/providers/:id/health-check - 执行提供商健康检查
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 验证管理员权限
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid provider ID' },
        { status: 400 }
      )
    }

    // 检查提供商是否存在
    const provider = getProviderById(id)
    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'Provider not found' },
        { status: 404 }
      )
    }

    // 执行健康检查
    const isHealthy = await checkProviderHealth(id)

    return NextResponse.json({ success: true, healthy: isHealthy })
  } catch (error: any) {
    console.error('[API] Provider health check error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to check provider health' },
      { status: 500 }
    )
  }
}
