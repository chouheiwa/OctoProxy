import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getAllProviders } from '@/lib/db/providers'

/**
 * GET /api/providers/export - 导出所有提供商
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const providers = getAllProviders()

    // 格式化导出数据
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      providers: providers.map((p: any) => {
        let credentials = p.credentials
        // 尝试解析凭据为对象
        try {
          credentials = JSON.parse(p.credentials)
        } catch {
          // 保持原样
        }

        // 为缺少 startUrl 的 OAuth providers 添加默认值
        if (typeof credentials === 'object' && credentials !== null) {
          const authMethod = credentials.authMethod
          if (
            (authMethod === 'builder-id' || authMethod === 'social') &&
            !credentials.startUrl
          ) {
            credentials.startUrl = 'https://view.awsapps.com/start'
            credentials.ssoRegion = credentials.region || 'us-east-1'
          }
        }

        return {
          name: p.name,
          region: p.region,
          credentials: credentials,
          checkHealth: p.check_health === 1,
          checkModelName: p.check_model_name,
          isDisabled: p.is_disabled === 1,
        }
      }),
    }

    return NextResponse.json({ success: true, ...exportData })
  } catch (error: any) {
    console.error('[API] Export providers error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
