import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { createProvider } from '@/lib/db/providers'
import { batchConvert, TokenFile } from '@/lib/utils/token-converter'

/**
 * POST /api/providers/import-from-tokens - 从 tokens 导入提供商
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { tokens } = body

    if (!tokens || !Array.isArray(tokens)) {
      return NextResponse.json(
        { error: 'Invalid request: tokens array required' },
        { status: 400 }
      )
    }

    try {
      // 批量转换
      const conversionResult = batchConvert(tokens as TokenFile[])

      // 批量创建 providers
      const results = {
        imported: 0,
        failed: conversionResult.failed,
        errors: [...conversionResult.errors] as Array<{ token: string; error: string }>,
      }

      for (const providerData of conversionResult.providers) {
        try {
          createProvider(providerData)
          results.imported++
        } catch (err: any) {
          results.failed++
          results.errors.push({
            token: providerData.name,
            error: err.message,
          })
        }
      }

      return NextResponse.json({ success: true, ...results })
    } catch (err: any) {
      console.error('[API] Import from tokens error:', err)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  } catch (error: any) {
    console.error('[API] Import from tokens error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
