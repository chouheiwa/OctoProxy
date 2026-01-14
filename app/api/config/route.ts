import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getConfig, updateConfig } from '@/lib/config'

/**
 * GET /api/config - 获取系统配置
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const config = getConfig()
    // 不返回敏感配置
    const { adminPassword, ...safeConfig } = config

    return NextResponse.json({ success: true, config: safeConfig })
  } catch (error: any) {
    console.error('[API] Get config error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/config - 更新系统配置
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()

    // 不允许通过 API 修改某些配置（安全措施）
    delete body.dbPath

    const config = updateConfig(body)
    const { adminPassword, ...safeConfig } = config

    return NextResponse.json({ success: true, config: safeConfig })
  } catch (error: any) {
    console.error('[API] Update config error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
