import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllProviders } from '@/lib/db/providers'
import { KiroService } from '@/lib/kiro/service'

/**
 * GET /api/usage - 获取所有提供商的用量信息
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const providers = getAllProviders()
    const usageList = []

    for (const provider of providers) {
      // 优先使用缓存的用量数据
      if (provider.cached_usage_used !== null && provider.cached_usage_limit !== null) {
        usageList.push({
          id: provider.id,
          name: provider.name || `Provider ${provider.id}`,
          account_email: provider.account_email,
          usage: {
            used: provider.cached_usage_used,
            limit: provider.cached_usage_limit,
            percent: provider.cached_usage_percent || 0,
          },
          exhausted: provider.usage_exhausted === 1,
          lastSync: provider.last_usage_sync,
          fromCache: true,
        })
      } else {
        // 没有缓存，返回空数据
        usageList.push({
          id: provider.id,
          name: provider.name || `Provider ${provider.id}`,
          account_email: provider.account_email,
          usage: null,
          exhausted: false,
          lastSync: null,
          fromCache: false,
        })
      }
    }

    return NextResponse.json({ success: true, usage: usageList })
  } catch (error: any) {
    console.error('[API] Get usage error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get usage' },
      { status: 500 }
    )
  }
}
