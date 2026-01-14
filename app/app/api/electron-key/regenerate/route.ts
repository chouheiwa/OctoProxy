import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession } from '@/lib/middleware/auth'
import { regenerateElectronKey } from '@/lib/electron-key'
import { isElectron } from '@/lib/config'

/**
 * POST /api/electron-key/regenerate - 重新生成 Electron Key
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateSession(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  // 检查是否在 Electron 环境
  if (!isElectron()) {
    return NextResponse.json(
      { success: false, error: 'Electron Key is only available in Electron environment' },
      { status: 400 }
    )
  }

  try {
    const config = await regenerateElectronKey()
    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Failed to regenerate Electron Key' },
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
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to regenerate Electron Key' },
      { status: 500 }
    )
  }
}
