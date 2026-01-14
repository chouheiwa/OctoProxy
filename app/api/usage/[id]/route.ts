import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import {
  getProviderById,
  updateProviderCredentials,
  updateProviderAccountEmail,
  updateProviderUsageData,
} from '@/lib/db/providers'
import { KiroService } from '@/lib/kiro/service'
import { formatKiroUsage } from '@/lib/kiro/usage-formatter'

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
 * GET /api/usage/[id] - 获取单个提供商的用量信息（优先使用缓存）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { id } = await params
    const providerId = parseInt(id, 10)

    const provider = getProviderById(providerId)
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    // 优先返回缓存数据
    if (provider.last_usage_sync && provider.cached_usage_data) {
      try {
        const cachedUsage = JSON.parse(provider.cached_usage_data)
        return NextResponse.json({
          success: true,
          providerId: provider.id,
          name: provider.name || `Provider #${provider.id}`,
          region: provider.region,
          usage: cachedUsage,
          lastSync: provider.last_usage_sync,
          cached: true,
        })
      } catch (e) {
        // 缓存数据解析失败，返回需要刷新
      }
    }

    // 没有缓存，返回需要刷新
    return NextResponse.json({
      success: true,
      providerId: provider.id,
      name: provider.name || `Provider #${provider.id}`,
      region: provider.region,
      usage: null,
      lastSync: null,
      cached: false,
      needsRefresh: true,
    })
  } catch (error: any) {
    console.error('[API] Get provider usage error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/usage/[id] - 刷新单个提供商的用量信息（强制从远程获取）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { id } = await params
    const providerId = parseInt(id, 10)

    const provider = getProviderById(providerId)
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    // 解析凭据
    let credentials
    try {
      credentials = JSON.parse(provider.credentials)
    } catch (e) {
      return NextResponse.json({ error: 'Invalid credentials format' }, { status: 400 })
    }

    // 创建服务实例并获取用量（合并 region 到 credentials）
    const service = new KiroService({ ...credentials, region: provider.region })
    await service.initialize()
    const rawUsage = await service.getUsageLimits()
    const usage = formatKiroUsage(rawUsage)

    // 检查 token 是否被刷新，如果是则保存新凭据
    if (
      service.accessToken !== credentials.accessToken ||
      service.refreshToken !== credentials.refreshToken
    ) {
      const updatedCredentials = {
        ...credentials,
        accessToken: service.accessToken,
        refreshToken: service.refreshToken,
        profileArn: service.profileArn,
        expiresAt: service.expiresAt,
      }
      updateProviderCredentials(provider.id, updatedCredentials)
      console.log(`[Usage] Updated credentials for provider ${provider.id}`)
    }

    // 更新账户邮箱缓存
    if (usage?.user?.email && usage.user.email !== provider.account_email) {
      updateProviderAccountEmail(provider.id, usage.user.email)
      console.log(
        `[Usage] Updated account email for provider ${provider.id}: ${usage.user.email}`
      )
    }

    // 保存用量缓存到数据库
    if (usage) {
      updateProviderUsageData(provider.id, usage)
    }

    return NextResponse.json({
      success: true,
      providerId: provider.id,
      name: provider.name || `Provider #${provider.id}`,
      region: provider.region,
      usage: usage,
      lastSync: new Date().toISOString(),
      cached: false,
    })
  } catch (error: any) {
    console.error('[API] Refresh provider usage error:', error)
    return NextResponse.json({ error: error.message || 'Failed to refresh usage' }, { status: 500 })
  }
}
