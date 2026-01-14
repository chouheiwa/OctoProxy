import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession } from '@/lib/middleware/auth'
import { getElectronKeyConfig, initElectronAutoKey } from '@/lib/electron-key'
import { isElectron } from '@/lib/config'

/**
 * GET /api/electron-key - 获取 Electron Key 配置
 */
export async function GET(request: NextRequest) {
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
    // 确保 Electron Key 已初始化
    await initElectronAutoKey()

    const config = getElectronKeyConfig()
    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Electron Key not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, electronKey: config })
  } catch (error: any) {
    console.error('[API] Get Electron Key error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get Electron Key' },
      { status: 500 }
    )
  }
}
