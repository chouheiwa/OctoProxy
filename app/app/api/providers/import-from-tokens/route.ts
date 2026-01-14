import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { createProvider } from '@/lib/db/providers'

/**
 * POST /api/providers/import-from-tokens - 从 tokens 数组批量导入提供商
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { tokens, region = 'us-east-1' } = body

    if (!Array.isArray(tokens)) {
      return NextResponse.json(
        { success: false, error: 'Invalid data: tokens must be an array' },
        { status: 400 }
      )
    }

    const results = {
      success: [] as any[],
      failed: [] as any[],
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      try {
        // 验证 token 格式
        if (!token || typeof token !== 'object') {
          results.failed.push({
            index: i,
            error: 'Invalid token format',
          })
          continue
        }

        // 必须有 accessToken 或 refreshToken
        if (!token.accessToken && !token.refreshToken) {
          results.failed.push({
            index: i,
            error: 'Missing accessToken or refreshToken',
          })
          continue
        }

        const credentials = JSON.stringify({
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: token.expiresAt,
        })

        const provider = createProvider({
          name: token.name || `Provider ${i + 1}`,
          region: token.region || region,
          credentials,
          account_email: token.email || token.account_email,
        })

        results.success.push({
          id: provider.id,
          name: provider.name,
        })
      } catch (err: any) {
        results.failed.push({
          index: i,
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
    console.error('[API] Import from tokens error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to import from tokens' },
      { status: 500 }
    )
  }
}
