import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession } from '@/lib/middleware/auth'
import { isElectron } from '@/lib/config'
import { getElectronKeyConfig } from '@/lib/electron-key'

/**
 * GET /api/electron-key - 获取 Electron Key 配置
 * 注意: 使用 authenticateSession (不是 Admin)，仅在 Electron 环境可用
 */
export async function GET(request: NextRequest) {
  try {
    // 环境检查：仅在 Electron 环境可用
    if (!isElectron()) {
      return NextResponse.json(
        { error: 'Electron Key is only available in Electron environment' },
        { status: 404 }
      )
    }

    const auth = await authenticateSession(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const config = getElectronKeyConfig()
    if (!config) {
      return NextResponse.json({ error: 'Electron Key not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, electronKey: config })
  } catch (error: any) {
    console.error('[API] Get Electron Key error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
