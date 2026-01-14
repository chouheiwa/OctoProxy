import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getProviderById, updateProvider } from '@/lib/db/providers'
import { KiroService } from '@/lib/kiro/service'

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
    if (provider.cached_usage_used !== null && provider.cached_usage_limit !== null) {
      return NextResponse.json({
        success: true,
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
    }

    // 没有缓存，尝试获取实时数据
    try {
      const credentials = JSON.parse(provider.credentials)
      const service = new KiroService(credentials, provider.region)
      const usage = await service.getUsage()

      // 更新缓存
      const percent = usage.limit > 0 ? Math.round((usage.used / usage.limit) * 100) : 0
      const exhausted = percent >= 100

      updateProvider(providerId, {
        cached_usage_used: usage.used,
        cached_usage_limit: usage.limit,
        cached_usage_percent: percent,
        usage_exhausted: exhausted ? 1 : 0,
        last_usage_sync: new Date().toISOString(),
      })

      return NextResponse.json({
        success: true,
        id: provider.id,
        name: provider.name || `Provider ${provider.id}`,
        account_email: provider.account_email,
        usage: {
          used: usage.used,
          limit: usage.limit,
          percent,
        },
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
    const service = new KiroService(credentials, provider.region)
    const usage = await service.getUsage()

    // 更新缓存
    const percent = usage.limit > 0 ? Math.round((usage.used / usage.limit) * 100) : 0
    const exhausted = percent >= 100

    updateProvider(providerId, {
      cached_usage_used: usage.used,
      cached_usage_limit: usage.limit,
      cached_usage_percent: percent,
      usage_exhausted: exhausted ? 1 : 0,
      last_usage_sync: new Date().toISOString(),
    })

    return NextResponse.json({
      id: provider.id,
      name: provider.name || `Provider ${provider.id}`,
      account_email: provider.account_email,
      usage: {
        used: usage.used,
        limit: usage.limit,
        percent,
      },
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
