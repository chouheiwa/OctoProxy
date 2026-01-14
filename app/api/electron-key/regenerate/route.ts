import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession } from '@/lib/middleware/auth'
import { isElectron } from '@/lib/config'
import { regenerateElectronKey } from '@/lib/electron-key'

/**
 * POST /api/electron-key/regenerate - 重新生成 Electron Key
 * 注意: 使用 authenticateSession (不是 Admin)，仅在 Electron 环境可用
 */
export async function POST(request: NextRequest) {
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

    const config = await regenerateElectronKey()
    if (!config) {
      return NextResponse.json(
        { error: 'Failed to regenerate Electron Key' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      electronKey: config,
      message: 'Electron Key regenerated successfully',
    })
  } catch (error: any) {
    console.error('[API] Regenerate Electron Key error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
