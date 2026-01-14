import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

function getConfigPath(): string {
  if (process.env.ELECTRON_CONFIG_DIR) {
    return join(process.env.ELECTRON_CONFIG_DIR, 'config.json')
  }
  return join(process.cwd(), '../configs/config.json')
}

function getDefaultConfig() {
  return {
    selectionStrategy: 'lru',
    maxErrorCount: 3,
    errorResetMinutes: 30,
    healthCheckEnabled: false,
    healthCheckIntervalMinutes: 60,
    healthCheckModel: 'claude-sonnet-4-20250514',
    systemPrompt: '',  // 转发请求时注入的 system prompt
  }
}

function loadConfig() {
  const configPath = getConfigPath()
  try {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf8')
      return { ...getDefaultConfig(), ...JSON.parse(content) }
    }
  } catch (err) {
    console.error('[Config] Failed to load config:', err)
  }
  return getDefaultConfig()
}

function saveConfig(config: any) {
  const configPath = getConfigPath()
  try {
    const { mkdirSync, dirname } = require('fs')
    const { dirname: pathDirname } = require('path')
    const dir = pathDirname(configPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(configPath, JSON.stringify(config, null, 2))
    return true
  } catch (err) {
    console.error('[Config] Failed to save config:', err)
    return false
  }
}

/**
 * GET /api/config - 获取系统配置
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const config = loadConfig()
    return NextResponse.json({ success: true, config })
  } catch (error: any) {
    console.error('[API] Get config error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get config' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/config - 更新系统配置
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const currentConfig = loadConfig()
    const newConfig = { ...currentConfig, ...body }

    if (!saveConfig(newConfig)) {
      return NextResponse.json(
        { success: false, error: 'Failed to save config' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, config: newConfig })
  } catch (error: any) {
    console.error('[API] Update config error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update config' },
      { status: 500 }
    )
  }
}
