import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { createProvider } from '@/lib/db/providers'

/**
 * POST /api/providers/import - 导入提供商配置
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { providers } = body

    if (!Array.isArray(providers)) {
      return NextResponse.json(
        { success: false, error: 'Invalid import data: providers must be an array' },
        { status: 400 }
      )
    }

    const results = {
      success: [] as any[],
      failed: [] as any[],
    }

    for (const providerData of providers) {
      try {
        // 验证必需字段
        if (!providerData.credentials) {
          results.failed.push({
            name: providerData.name || 'Unknown',
            error: 'Missing credentials',
          })
          continue
        }

        // 确保 credentials 是字符串
        const credentials = typeof providerData.credentials === 'string'
          ? providerData.credentials
          : JSON.stringify(providerData.credentials)

        const provider = createProvider({
          name: providerData.name,
          region: providerData.region || 'us-east-1',
          credentials,
          account_email: providerData.account_email,
          check_health: providerData.check_health || 0,
          check_model_name: providerData.check_model_name,
          is_disabled: providerData.is_disabled || 0,
        })

        results.success.push({
          id: provider.id,
          name: provider.name,
        })
      } catch (err: any) {
        results.failed.push({
          name: providerData.name || 'Unknown',
          error: err.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${results.success.length} providers, ${results.failed.length} failed`,
      results,
    })
  } catch (error: any) {
    console.error('[API] Import providers error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to import providers' },
      { status: 500 }
    )
  }
}
