import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllProviders } from '@/lib/db/providers'

/**
 * GET /api/providers/export - 导出所有提供商配置
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const providers = getAllProviders()

    // 导出配置（包含凭据）
    const exportData = providers.map(provider => ({
      name: provider.name,
      region: provider.region,
      credentials: provider.credentials, // JSON string
      account_email: provider.account_email,
      check_health: provider.check_health,
      check_model_name: provider.check_model_name,
      is_disabled: provider.is_disabled,
    }))

    return NextResponse.json({
      success: true,
      version: '1.0',
      exportedAt: new Date().toISOString(),
      count: exportData.length,
      providers: exportData,
    })
  } catch (error: any) {
    console.error('[API] Export providers error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to export providers' },
      { status: 500 }
    )
  }
}
