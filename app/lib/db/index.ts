import Database from 'better-sqlite3'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import crypto from 'crypto'

let db: Database.Database | null = null
let electronKeyInitialized = false

/**
 * 获取数据库路径
 */
function getDatabasePath(): string {
  // Electron 环境
  if (process.env.ELECTRON_DATA_DIR) {
    return join(process.env.ELECTRON_DATA_DIR, 'octo-proxy.db')
  }

  // Next.js 环境
  if (process.env.DB_PATH) {
    return process.env.DB_PATH
  }

  // 默认路径（开发环境）
  return join(process.cwd(), '../data/octo-proxy.db')
}

/**
 * 获取迁移目录路径
 */
function getMigrationsDirectory(): string {
  // Electron 环境
  if (process.env.ELECTRON_MIGRATIONS_DIR) {
    return process.env.ELECTRON_MIGRATIONS_DIR
  }

  // Next.js 环境（开发和生产）
  // 迁移文件位于项目根目录的 lib/db/migrations
  return join(process.cwd(), 'lib', 'db', 'migrations')
}

/**
 * 初始化数据库
 */
export function initDatabase(dbPath?: string): Database.Database {
  const finalDbPath = dbPath || getDatabasePath()

  // 确保数据目录存在
  const dbDir = dirname(finalDbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  // 创建数据库连接
  db = new Database(finalDbPath)

  // 启用 WAL 模式提高并发性能
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 运行迁移
  runMigrations()

  // 确保默认管理员存在
  ensureDefaultAdmin()

  // 初始化 Electron Auto Key（仅在 Electron 环境）
  initElectronKeyIfNeeded()

  console.log(`[Database] Initialized at ${finalDbPath}`)
  return db
}

/**
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    // 自动初始化
    return initDatabase()
  }
  return db
}

/**
 * 运行数据库迁移
 */
function runMigrations(): void {
  if (!db) throw new Error('Database not initialized')

  // 创建迁移记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `)

  // 获取已应用的迁移
  const applied = db
    .prepare('SELECT name FROM migrations')
    .all()
    .map((r: any) => r.name)

  // 读取并执行迁移文件
  const migrationsDir = getMigrationsDirectory()
  const migrationFiles = [
    '001_init.sql',
    '002_add_account_email.sql',
    '003_add_usage_cache.sql',
    '004_add_usage_data_cache.sql',
  ]

  for (const migrationFile of migrationFiles) {
    if (!applied.includes(migrationFile)) {
      try {
        const migrationPath = join(migrationsDir, migrationFile)
        if (!existsSync(migrationPath)) {
          console.warn(`[Database] Migration file not found: ${migrationPath}`)
          continue
        }
        const sql = readFileSync(migrationPath, 'utf8')
        db.exec(sql)
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationFile)
        console.log(`[Database] Applied migration: ${migrationFile}`)
      } catch (err: any) {
        console.error(
          `[Database] Failed to apply migration ${migrationFile}:`,
          err.message
        )
      }
    }
  }
}

/**
 * 确保默认管理员账户存在
 */
function ensureDefaultAdmin(): void {
  if (!db) throw new Error('Database not initialized')

  const admin = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get('admin')

  if (!admin) {
    // 创建默认管理员，密码为 admin123
    const passwordHash = hashPassword('admin123')
    db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, 'admin')
    `).run('admin', passwordHash)
    console.log(
      '[Database] Created default admin user (username: admin, password: admin123)'
    )
  }
}

/**
 * 密码哈希
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * 验证密码
 */
export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    console.log('[Database] Connection closed')
  }
}

/**
 * 初始化 Electron Auto Key（仅在 Electron 环境）
 */
function initElectronKeyIfNeeded(): void {
  console.log('[Database] initElectronKeyIfNeeded called, ELECTRON_APP =', process.env.ELECTRON_APP)

  if (electronKeyInitialized) {
    console.log('[Database] Electron key already initialized, skipping')
    return
  }

  // 检查是否在 Electron 环境
  if (process.env.ELECTRON_APP !== 'true') {
    console.log('[Database] Not in Electron environment, skipping Electron key init')
    return
  }

  electronKeyInitialized = true
  console.log('[Database] Starting Electron Auto Key initialization...')

  // 使用 setTimeout 延迟执行，避免循环依赖问题
  setTimeout(async () => {
    try {
      console.log('[Database] Loading electron-key module...')
      const { initElectronAutoKey } = await import('../electron-key')
      console.log('[Database] Calling initElectronAutoKey...')
      await initElectronAutoKey()
      console.log('[Database] Electron Auto Key initialization completed')
    } catch (err: any) {
      console.error('[Database] Failed to initialize Electron Auto Key:', err.message, err.stack)
    }
  }, 100)
}

export default getDatabase
