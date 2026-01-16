import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllProviders } from '@/lib/db/providers'
import { calculateTotalUsage } from '@/lib/kiro/usage-formatter'

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
      if (provider.cached_usage_data) {
        try {
          const cachedUsage = JSON.parse(provider.cached_usage_data)
          const breakdown = cachedUsage?.usageBreakdown?.[0]
          const { used, limit, percent } = calculateTotalUsage(breakdown)
          const exhausted = percent >= 100

          usageList.push({
            id: provider.id,
            name: provider.name || `Provider ${provider.id}`,
            account_email: cachedUsage?.user?.email || provider.account_email,
            subscription: cachedUsage?.subscription || null,
            usage: { used, limit, percent },
            exhausted,
            lastSync: provider.last_usage_sync,
            fromCache: true,
          })
        } catch {
          // 缓存数据解析失败，返回空数据
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
