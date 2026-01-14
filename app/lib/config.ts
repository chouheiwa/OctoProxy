/**
 * 配置管理模块
 */

import fs from 'fs'
import path from 'path'

export type ProviderStrategy =
  | 'lru'
  | 'round_robin'
  | 'least_usage'
  | 'most_usage'
  | 'oldest_first'

export interface Config {
  port: number
  host: string
  dbPath: string
  adminPassword: string
  sessionExpireHours: number
  maxErrorCount: number
  healthCheckIntervalMinutes: number
  requestMaxRetries: number
  requestBaseDelay: number
  cronRefreshTokenMinutes: number
  providerStrategy: ProviderStrategy
  usageSyncIntervalMinutes: number
  debug: boolean
}

// 默认配置
const defaultConfig: Config = {
  port: 12000,
  host: '0.0.0.0',
  dbPath: 'data/octo-proxy.db',
  adminPassword: 'admin123',
  sessionExpireHours: 24,
  maxErrorCount: 3,
  healthCheckIntervalMinutes: 10,
  requestMaxRetries: 3,
  requestBaseDelay: 1000,
  cronRefreshTokenMinutes: 15,
  providerStrategy: 'lru',
  usageSyncIntervalMinutes: 10,
  debug: false,
}

let config: Config | null = null
let configPath: string | null = null
let projectRoot: string | null = null

/**
 * 检测是否在 Electron 环境中运行
 */
export function isElectron(): boolean {
  return process.env.ELECTRON_APP === 'true'
}

/**
 * 获取项目根目录
 */
export function getProjectRoot(): string {
  if (projectRoot) return projectRoot

  if (isElectron()) {
    // Electron 环境
    projectRoot = path.resolve(__dirname, '../..')
  } else {
    // Next.js 环境
    projectRoot = path.resolve(process.cwd(), '..')
  }

  return projectRoot
}

/**
 * 获取配置目录
 */
export function getConfigDir(): string {
  if (isElectron() && process.env.ELECTRON_CONFIG_DIR) {
    return process.env.ELECTRON_CONFIG_DIR
  }
  return path.join(getProjectRoot(), 'configs')
}

/**
 * 获取数据目录
 */
export function getDataDir(): string {
  if (isElectron() && process.env.ELECTRON_DATA_DIR) {
    return process.env.ELECTRON_DATA_DIR
  }
  return path.join(getProjectRoot(), 'data')
}

/**
 * 获取静态文件目录
 */
export function getStaticDir(): string {
  if (isElectron() && process.env.ELECTRON_STATIC_DIR) {
    return process.env.ELECTRON_STATIC_DIR
  }
  return path.join(getProjectRoot(), 'static')
}

/**
 * 获取数据库迁移目录
 */
export function getMigrationsDir(): string {
  if (isElectron() && process.env.ELECTRON_MIGRATIONS_DIR) {
    return process.env.ELECTRON_MIGRATIONS_DIR
  }
  return path.join(__dirname, 'db', 'migrations')
}

/**
 * 获取配置文件路径
 */
function getConfigPath(): string {
  if (configPath) return configPath

  configPath = path.join(getConfigDir(), 'config.json')
  return configPath
}

/**
 * 确保目录存在
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 加载配置
 */
export function loadConfig(): Config {
  const filePath = getConfigPath()

  try {
    // 确保配置目录存在
    ensureDir(path.dirname(filePath))

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const fileConfig = JSON.parse(content) as Partial<Config>
      config = { ...defaultConfig, ...fileConfig }
    } else {
      // 配置文件不存在，创建默认配置
      fs.writeFileSync(filePath, JSON.stringify(defaultConfig, null, 2))
      config = { ...defaultConfig }
    }
  } catch (error: any) {
    console.error('[Config] Failed to load config:', error.message)
    config = { ...defaultConfig }
  }

  return config
}

/**
 * 获取配置
 */
export function getConfig(): Config {
  if (!config) {
    loadConfig()
  }
  return config!
}

/**
 * 更新配置
 */
export function updateConfig(updates: Partial<Config>): Config {
  const current = getConfig()
  const newConfig = { ...current, ...updates }

  const filePath = getConfigPath()
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(newConfig, null, 2))

  config = newConfig
  return config
}

/**
 * 获取数据库完整路径
 */
export function getDbPath(): string {
  const cfg = getConfig()
  const dataDir = getDataDir()

  // 确保数据目录存在
  ensureDir(dataDir)

  // 如果配置中是相对路径，使用数据目录
  if (!path.isAbsolute(cfg.dbPath)) {
    // 提取文件名
    const dbFileName = path.basename(cfg.dbPath)
    return path.join(dataDir, dbFileName)
  }

  return cfg.dbPath
}

export default {
  loadConfig,
  getConfig,
  updateConfig,
  getDbPath,
  isElectron,
  getProjectRoot,
  getConfigDir,
  getDataDir,
  getStaticDir,
  getMigrationsDir,
}
