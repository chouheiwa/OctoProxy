import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getProviderById, updateProvider } from '@/lib/db/providers'
import { KiroService } from '@/lib/kiro/service'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/providers/[id]/refresh-token - 刷新提供商的 token
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

    // 刷新 token
    const newCredentials = await service.refreshToken()

    // 更新数据库中的凭据
    updateProvider(providerId, {
      credentials: JSON.stringify(newCredentials),
    })

    return NextResponse.json({
      success: true,
      message: 'Token refreshed successfully',
      expiresAt: newCredentials.expiresAt,
    })
  } catch (error: any) {
    console.error('[API] Refresh token error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to refresh token' },
      { status: 500 }
    )
  }
}
