import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { waitForAuth } from '@/lib/kiro/oauth'
import { createProvider } from '@/lib/db/providers'

/**
 * POST /api/oauth/complete - 等待 OAuth 完成并创建提供商
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { sessionId, name, checkHealth, checkModelName, timeout } = body

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    try {
      // 等待认证完成（可能很长时间）
      const credentials = await waitForAuth(sessionId, timeout || 300000)

      // 创建提供商
      const provider = createProvider({
        name: name || `Kiro ${credentials.authMethod} Provider`,
        region: credentials.region || 'us-east-1',
        credentials: JSON.stringify(credentials),
        checkHealth: checkHealth !== false,
        checkModelName,
      })

      if (!provider) {
        return NextResponse.json(
          { error: 'Failed to create provider' },
          { status: 500 }
        )
      }

      // 移除凭据后返回
      const { credentials: _, ...safe } = provider
      return NextResponse.json({
        success: true,
        provider: safe,
        message: 'OAuth authentication completed and provider created',
      })
    } catch (error: any) {
      console.error('[OAuth] Complete auth error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } catch (error: any) {
    console.error('[API] OAuth complete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
