import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getProviderById, updateProviderUsageData } from '@/lib/db/providers'
import { KiroService } from '@/lib/kiro/service'
import { formatKiroUsage } from '@/lib/kiro/usage-formatter'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/usage/[id] - 获取单个提供商用量（优先使用缓存）
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const { id } = await params
  const providerId = parseInt(id, 10)
  if (isNaN(providerId)) {
    return NextResponse.json({ success: false, error: 'Invalid provider ID' }, { status: 400 })
  }

  try {
    const provider = getProviderById(providerId)
    if (!provider) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 })
    }

    // 优先使用缓存
    if (provider.cached_usage_data) {
      try {
        const cachedUsage = JSON.parse(provider.cached_usage_data)
        const breakdown = cachedUsage?.usageBreakdown?.[0]
        const used = breakdown?.currentUsage || 0
        const limit = breakdown?.usageLimit || 0
        const percent = limit > 0 ? Math.round((used / limit) * 100) : 0
        const exhausted = percent >= 100

        return NextResponse.json({
          success: true,
          id: provider.id,
          name: provider.name || `Provider ${provider.id}`,
          account_email: cachedUsage?.user?.email || provider.account_email,
          usage: { used, limit, percent },
          exhausted,
          lastSync: provider.last_usage_sync,
          fromCache: true,
        })
      } catch {
        // 缓存数据解析失败，继续获取实时数据
      }
    }

    // 没有缓存，尝试获取实时数据
    try {
      const credentials = JSON.parse(provider.credentials)
      const service = new KiroService({ ...credentials, region: provider.region })
      await service.initialize()
      const rawUsage = await service.getUsageLimits()
      const formattedUsage = formatKiroUsage(rawUsage)

      // 从格式化数据中提取用量
      const breakdown = formattedUsage?.usageBreakdown?.[0]
      const used = breakdown?.currentUsage || 0
      const limit = breakdown?.usageLimit || 0
      const percent = limit > 0 ? Math.round((used / limit) * 100) : 0
      const exhausted = percent >= 100

      if (formattedUsage) {
        updateProviderUsageData(providerId, formattedUsage)
      }

      return NextResponse.json({
        success: true,
        id: provider.id,
        name: provider.name || `Provider ${provider.id}`,
        account_email: formattedUsage?.user?.email || provider.account_email,
        usage: { used, limit, percent },
        exhausted,
        lastSync: new Date().toISOString(),
        fromCache: false,
      })
    } catch (err: any) {
      console.error(`[API] Failed to fetch usage for provider ${providerId}:`, err.message)
      return NextResponse.json({
        success: true,
        id: provider.id,
        name: provider.name || `Provider ${provider.id}`,
        account_email: provider.account_email,
        usage: null,
        error: err.message,
        fromCache: false,
      })
    }
  } catch (error: any) {
    console.error('[API] Get provider usage error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get provider usage' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/usage/[id] - 强制刷新提供商用量
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  const { id } = await params
  const providerId = parseInt(id, 10)
  if (isNaN(providerId)) {
    return NextResponse.json({ success: false, error: 'Invalid provider ID' }, { status: 400 })
  }

  try {
    const provider = getProviderById(providerId)
    if (!provider) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 })
    }

    const credentials = JSON.parse(provider.credentials)
    const service = new KiroService({ ...credentials, region: provider.region })
    await service.initialize()
    const rawUsage = await service.getUsageLimits()
    const formattedUsage = formatKiroUsage(rawUsage)

    // 从格式化数据中提取用量
    const breakdown = formattedUsage?.usageBreakdown?.[0]
    const used = breakdown?.currentUsage || 0
    const limit = breakdown?.usageLimit || 0
    const percent = limit > 0 ? Math.round((used / limit) * 100) : 0
    const exhausted = percent >= 100

    if (formattedUsage) {
      updateProviderUsageData(providerId, formattedUsage)
    }

    return NextResponse.json({
      success: true,
      id: provider.id,
      name: provider.name || `Provider ${provider.id}`,
      account_email: formattedUsage?.user?.email || provider.account_email,
      usage: { used, limit, percent },
      exhausted,
      lastSync: new Date().toISOString(),
      fromCache: false,
    })
  } catch (error: any) {
    console.error('[API] Refresh provider usage error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to refresh usage' },
      { status: 500 }
    )
  }
}
