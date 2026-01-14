import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { createProvider } from '@/lib/db/providers'

/**
 * 从扫描的 token 数据中提取 credentials
 */
function extractCredentials(tokenData: any): object {
  const data = tokenData.data || tokenData

  // 基础 credentials
  const credentials: any = {
    accessToken: data.accessToken || '',
    refreshToken: data.refreshToken || '',
    expiresAt: data.expiresAt || data.expiration || '',
    region: data.region || 'us-east-1',
  }

  // 处理 authMethod
  const authMethod = data.authMethod || ''
  if (authMethod === 'IdC' || authMethod === 'builder-id') {
    credentials.authMethod = 'builder-id'
    // 对于 IdC/builder-id，需要 clientId 和 clientSecret 才能刷新 token
    if (data.clientId) {
      credentials.clientId = data.clientId
    }
    if (data.clientSecret) {
      credentials.clientSecret = data.clientSecret
    }
  } else if (authMethod === 'social') {
    credentials.authMethod = 'social'
    // social auth 可能有 profileArn
    if (data.profileArn) {
      credentials.profileArn = data.profileArn
    }
  } else {
    // 默认根据是否有 clientId 来判断
    if (data.clientId && data.clientSecret) {
      credentials.authMethod = 'builder-id'
      credentials.clientId = data.clientId
      credentials.clientSecret = data.clientSecret
    } else if (data.profileArn) {
      credentials.authMethod = 'social'
      credentials.profileArn = data.profileArn
    }
  }

  return credentials
}

/**
 * 生成 provider 名称
 */
function generateProviderName(tokenData: any, index: number): string {
  const data = tokenData.data || tokenData
  const source = tokenData.source || 'Unknown'
  const fileName = tokenData.fileName || ''

  // 尝试从文件名或数据中提取有意义的名称
  if (fileName === 'kiro-auth-token.json') {
    const provider = data.provider || 'Kiro'
    const timestamp = new Date().toISOString().slice(0, 10)
    return `[Auto] ${provider} - ${timestamp}`
  }

  // 使用来源和索引
  const timestamp = new Date().toISOString().slice(0, 10)
  return `[Auto] ${source} - ${timestamp} #${index + 1}`
}

/**
 * POST /api/providers/import-from-tokens - 从 tokens 数组批量导入提供商
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const tokens = await request.json()

    if (!Array.isArray(tokens)) {
      return NextResponse.json(
        { success: false, error: 'Invalid data: tokens must be an array' },
        { status: 400 }
      )
    }

    let imported = 0
    let failed = 0
    const errors: any[] = []

    for (let i = 0; i < tokens.length; i++) {
      const tokenData = tokens[i]
      try {
        // 验证 token 格式
        if (!tokenData || typeof tokenData !== 'object') {
          failed++
          errors.push({ index: i, error: 'Invalid token format' })
          continue
        }

        const data = tokenData.data || tokenData

        // 必须有 accessToken 或 refreshToken
        if (!data.accessToken && !data.refreshToken) {
          failed++
          errors.push({ index: i, error: 'Missing accessToken or refreshToken' })
          continue
        }

        // 提取 credentials
        const credentials = extractCredentials(tokenData)

        // 生成名称
        const name = generateProviderName(tokenData, i)

        // 创建 provider
        const provider = createProvider({
          name,
          region: data.region || 'us-east-1',
          credentials: JSON.stringify(credentials),
        })

        if (!provider) {
          failed++
          errors.push({ index: i, error: 'Failed to create provider' })
          continue
        }

        imported++
        console.log(`[API] Imported provider: ${provider.name} (ID: ${provider.id})`)
      } catch (err: any) {
        failed++
        errors.push({ index: i, error: err.message })
        console.error(`[API] Failed to import token ${i}:`, err.message)
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[API] Import from tokens error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to import from tokens' },
      { status: 500 }
    )
  }
}
