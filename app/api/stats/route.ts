import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getUserStats } from '@/lib/db/users'
import { getApiKeyStats } from '@/lib/db/api-keys'
import { getProviderStats } from '@/lib/db/providers'
import { getPoolStats } from '@/lib/pool/manager'

/**
 * GET /api/stats - 获取系统统计信息
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const userStats = getUserStats()
    const apiKeyStats = getApiKeyStats()
    const providerStats = getProviderStats()
    const poolStats = getPoolStats()

    return NextResponse.json({
      success: true,
      users: userStats,
      apiKeys: apiKeyStats,
      providers: providerStats,
      pool: poolStats,
    })
  } catch (error: any) {
    console.error('[API] Get stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
