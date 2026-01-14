/**
 * 数据库初始化脚本
 */
import { initDatabase } from '../lib/db'
import { getDbPath } from '../lib/config'

console.log('[Init] Initializing database...')

const dbPath = getDbPath()
console.log(`[Init] Database path: ${dbPath}`)

initDatabase(dbPath)

console.log('[Init] Database initialized successfully!')
console.log('[Init] Default admin credentials:')
console.log('[Init]   Username: admin')
console.log('[Init]   Password: admin123')
