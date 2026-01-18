import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import crypto from 'crypto'

// sql.js 数据库实例
let sqliteDb: SqlJsDatabase | null = null
let dbPath: string | null = null
let electronKeyInitialized = false
let saveTimeout: NodeJS.Timeout | null = null

// sql.js SQL 对象（需要异步初始化）
let SQL: initSqlJs.SqlJsStatic | null = null

// 初始化 Promise（用于确保只初始化一次）
let initPromise: Promise<void> | null = null

// 文件同步相关：记录上次加载时的文件修改时间
let lastFileMtime: number = 0

/**
 * Statement 包装器，模拟 better-sqlite3 的 API
 */
class StatementWrapper {
  private db: SqlJsDatabase
  private sql: string

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db
    this.sql = sql
  }

  /**
   * 执行查询并返回所有结果
   */
  all(...params: any[]): any[] {
    try {
      const stmt = this.db.prepare(this.sql)
      if (params.length > 0) {
        stmt.bind(params)
      }

      const results: any[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject())
      }
      stmt.free()
      return results
    } catch (error) {
      console.error('[Database] Query error:', this.sql, error)
      throw error
    }
  }

  /**
   * 执行查询并返回第一个结果
   */
  get(...params: any[]): any {
    try {
      const stmt = this.db.prepare(this.sql)
      if (params.length > 0) {
        stmt.bind(params)
      }

      let result = undefined
      if (stmt.step()) {
        result = stmt.getAsObject()
      }
      stmt.free()
      return result
    } catch (error) {
      console.error('[Database] Query error:', this.sql, error)
      throw error
    }
  }

  /**
   * 执行修改操作（INSERT/UPDATE/DELETE）
   */
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    try {
      if (params.length > 0) {
        this.db.run(this.sql, params)
      } else {
        this.db.run(this.sql)
      }

      // 获取影响的行数
      const changesStmt = this.db.prepare('SELECT changes() as changes')
      changesStmt.step()
      const changes = (changesStmt.getAsObject() as any).changes || 0
      changesStmt.free()

      // 获取最后插入的行 ID
      const lastIdStmt = this.db.prepare('SELECT last_insert_rowid() as lastId')
      lastIdStmt.step()
      const lastInsertRowid = (lastIdStmt.getAsObject() as any).lastId || 0
      lastIdStmt.free()

      // 延迟保存数据库
      scheduleSave()

      return { changes, lastInsertRowid }
    } catch (error) {
      console.error('[Database] Run error:', this.sql, error)
      throw error
    }
  }
}

/**
 * 数据库包装器，模拟 better-sqlite3 的 API
 */
class DatabaseWrapper {
  private db: SqlJsDatabase

  constructor(db: SqlJsDatabase) {
    this.db = db
  }

  /**
   * 准备 SQL 语句
   */
  prepare(sql: string): StatementWrapper {
    return new StatementWrapper(this.db, sql)
  }

  /**
   * 执行原始 SQL
   */
  exec(sql: string): void {
    try {
      this.db.exec(sql)
      scheduleSave()
    } catch (error) {
      console.error('[Database] Exec error:', sql, error)
      throw error
    }
  }

  /**
   * 执行 PRAGMA 命令
   */
  pragma(pragma: string): any {
    try {
      // sql.js 不支持 WAL 模式，忽略相关 pragma
      if (pragma.includes('journal_mode') || pragma.includes('WAL')) {
        console.log('[Database] Skipping unsupported pragma:', pragma)
        return
      }

      const result = this.db.exec(`PRAGMA ${pragma}`)
      return result.length > 0 ? result[0].values : undefined
    } catch (error) {
      console.error('[Database] Pragma error:', pragma, error)
      // 不抛出错误，pragma 失败通常不是致命的
    }
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    saveDatabase()
    this.db.close()
  }

  /**
   * 获取原始 sql.js 数据库实例
   */
  getRawDb(): SqlJsDatabase {
    return this.db
  }
}

// 当前数据库包装器实例
let db: DatabaseWrapper | null = null

/**
 * 安排延迟保存（防抖）
 */
function scheduleSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
  }
  saveTimeout = setTimeout(() => {
    saveDatabase()
    saveTimeout = null
  }, 100) // 100ms 后保存（减少延迟）
}

/**
 * 保存数据库到文件
 */
function saveDatabase(): void {
  if (!sqliteDb || !dbPath) return

  try {
    const data = sqliteDb.export()
    const buffer = Buffer.from(data)
    writeFileSync(dbPath, buffer)
    // 更新文件修改时间记录
    lastFileMtime = statSync(dbPath).mtimeMs
  } catch (error) {
    console.error('[Database] Failed to save database:', error)
  }
}

/**
 * 立即保存数据库（用于关键操作后）
 */
export function saveImmediately(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
  saveDatabase()
}

/**
 * 从文件重新加载数据库（内部使用）
 * 注意：这会丢弃内存中未保存的更改
 * @deprecated 不再需要手动调用，getDatabase() 会自动检测文件变化
 */
function reloadFromFile(): void {
  if (!SQL || !dbPath) {
    console.warn('[Database] Cannot reload: SQL or dbPath not initialized')
    return
  }

  try {
    if (existsSync(dbPath)) {
      const data = readFileSync(dbPath)
      // 关闭旧的数据库实例
      if (sqliteDb) {
        sqliteDb.close()
      }
      // 创建新的数据库实例
      sqliteDb = new SQL.Database(data)
      db = new DatabaseWrapper(sqliteDb)
      console.log('[Database] Reloaded from file')
    }
  } catch (error) {
    console.error('[Database] Failed to reload from file:', error)
  }
}

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

// 扩展 process 类型以包含 Electron 的 resourcesPath
declare const process: NodeJS.Process & { resourcesPath?: string }

/**
 * 获取 sql.js WASM 二进制数据
 */
function getWasmBinary(): ArrayBuffer | undefined {
  try {
    // 尝试多个可能的路径
    const possiblePaths = [
      // Electron 打包后的路径
      process.env.ELECTRON_IS_PACKAGED === 'true' && process.resourcesPath
        ? join(process.resourcesPath, 'app', '.next', 'standalone', 'app', 'public', 'wasm', 'sql-wasm.wasm')
        : null,
      // Next.js standalone 模式
      join(process.cwd(), 'public', 'wasm', 'sql-wasm.wasm'),
      // 开发模式
      join(process.cwd(), '../app/public/wasm/sql-wasm.wasm'),
      // node_modules 路径
      join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    ].filter(Boolean) as string[]

    for (const wasmPath of possiblePaths) {
      if (existsSync(wasmPath)) {
        console.log(`[Database] Loading WASM from: ${wasmPath}`)
        const buffer = readFileSync(wasmPath)
        // 将 Buffer 转换为 ArrayBuffer
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      }
    }

    console.warn('[Database] WASM file not found locally, will use default loader')
    return undefined
  } catch (error) {
    console.error('[Database] Error loading WASM:', error)
    return undefined
  }
}

/**
 * 获取 sql.js 配置
 */
function getSqlJsConfig(): initSqlJs.SqlJsConfig | undefined {
  const wasmBinary = getWasmBinary()

  if (wasmBinary) {
    return { wasmBinary }
  }

  // 如果本地文件不存在，使用 CDN 作为后备
  console.log('[Database] Using CDN for WASM file')
  return {
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`
  }
}

/**
 * 初始化数据库
 */
export function initDatabase(customDbPath?: string): DatabaseWrapper {
  // 如果已经初始化，直接返回
  if (db && sqliteDb) {
    return db
  }

  // sql.js 需要同步初始化，这里使用同步方式
  // 在 Next.js 服务端渲染时这是可行的
  if (!SQL) {
    throw new Error('SQL.js not initialized. Call initDatabaseAsync() first.')
  }

  const finalDbPath = customDbPath || getDatabasePath()
  dbPath = finalDbPath

  // 确保数据目录存在
  const dbDir = dirname(finalDbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  // 加载或创建数据库
  let data: Buffer | null = null
  if (existsSync(finalDbPath)) {
    data = readFileSync(finalDbPath)
    // 记录文件修改时间
    lastFileMtime = statSync(finalDbPath).mtimeMs
    console.log(`[Database] Loading existing database from ${finalDbPath}`)
  } else {
    console.log(`[Database] Creating new database at ${finalDbPath}`)
  }

  // 创建 sql.js 数据库实例
  sqliteDb = data ? new SQL.Database(data) : new SQL.Database()

  // 创建包装器
  db = new DatabaseWrapper(sqliteDb)

  // 启用外键约束（WAL 模式在 sql.js 中不支持）
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
 * 异步初始化数据库（首次使用时调用）
 */
export async function initDatabaseAsync(customDbPath?: string): Promise<DatabaseWrapper> {
  // 初始化 sql.js
  if (!SQL) {
    const config = getSqlJsConfig()
    SQL = await initSqlJs(config)
    console.log('[Database] sql.js initialized')
  }

  return initDatabase(customDbPath)
}

/**
 * 确保 sql.js 已初始化
 */
async function ensureSqlJsInitialized(): Promise<void> {
  if (SQL) return

  if (!initPromise) {
    initPromise = (async () => {
      const config = getSqlJsConfig()
      SQL = await initSqlJs(config)
      console.log('[Database] sql.js WASM initialized')
    })()
  }

  await initPromise
}

/**
 * 检查文件是否被其他进程修改，如果是则重新加载
 */
function checkAndReloadIfNeeded(): void {
  if (!SQL || !dbPath || !db) return

  try {
    if (existsSync(dbPath)) {
      const currentMtime = statSync(dbPath).mtimeMs
      // 如果文件被其他进程修改（mtime 变化），重新加载
      if (currentMtime > lastFileMtime) {
        const data = readFileSync(dbPath)
        // 关闭旧的数据库实例
        if (sqliteDb) {
          sqliteDb.close()
        }
        // 创建新的数据库实例
        sqliteDb = new SQL.Database(data)
        db = new DatabaseWrapper(sqliteDb)
        lastFileMtime = currentMtime
        console.log('[Database] Auto-reloaded due to file change')
      }
    }
  } catch (error) {
    console.error('[Database] Failed to check/reload database:', error)
  }
}

/**
 * 获取数据库实例（同步版本，需要先调用 ensureDatabase）
 * 自动检测文件变化并重新加载，解决多 worker 环境下的数据同步问题
 */
export function getDatabase(): DatabaseWrapper {
  if (!db) {
    if (!SQL) {
      throw new Error('Database not initialized. Call ensureDatabase() first in an async context.')
    }
    return initDatabase()
  }

  // 检查文件是否被其他进程修改，如果是则重新加载
  checkAndReloadIfNeeded()

  return db
}

/**
 * 确保数据库已初始化（异步）
 * 在 API 路由开始时调用此函数
 */
export async function ensureDatabase(): Promise<DatabaseWrapper> {
  if (db) return db

  await ensureSqlJsInitialized()
  return initDatabase()
}

/**
 * 异步获取数据库实例
 * @deprecated 使用 ensureDatabase() 替代
 */
export async function getDatabaseAsync(): Promise<DatabaseWrapper> {
  return ensureDatabase()
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
    '005_add_model_access.sql',
    '006_add_oauth_sessions.sql',
    '007_add_provider_type.sql',
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
    sqliteDb = null
    dbPath = null
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
