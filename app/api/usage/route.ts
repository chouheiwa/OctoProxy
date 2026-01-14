import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllProviders } from '@/lib/db/providers'

/**
 * 用量结果接口
 */
interface UsageResult {
  providerId: number
  name: string
  region: string
  usage: any
  lastSync: string | null
  cached: boolean
  needsRefresh?: boolean
}

/**
 * GET /api/usage - 获取所有提供商的用量信息（优先使用缓存）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const providers = getAllProviders().filter((p) => !p.is_disabled)
    const usageResults: UsageResult[] = []

    for (const provider of providers) {
      // 优先使用缓存数据
      if (provider.last_usage_sync && provider.cached_usage_data) {
        try {
          const cachedUsage = JSON.parse(provider.cached_usage_data)
          usageResults.push({
            providerId: provider.id,
            name: provider.name || `Provider #${provider.id}`,
            region: provider.region,
            usage: cachedUsage,
            lastSync: provider.last_usage_sync,
            cached: true,
          })
          continue
        } catch (e) {
          // 缓存数据解析失败，标记需要刷新
        }
      }

      // 没有缓存数据，返回空数据提示需要刷新
      usageResults.push({
        providerId: provider.id,
        name: provider.name || `Provider #${provider.id}`,
        region: provider.region,
        usage: null,
        lastSync: null,
        cached: false,
        needsRefresh: true,
      })
    }

    return NextResponse.json({ success: true, providers: usageResults })
  } catch (error: any) {
    console.error('[API] Get usage error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
