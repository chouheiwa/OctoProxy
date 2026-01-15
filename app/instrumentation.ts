/**
 * Next.js Instrumentation
 * 在服务器启动时初始化数据库
 */

export async function register() {
  // 只在服务端运行
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing database...')

    try {
      const { ensureDatabase } = await import('./lib/db')
      await ensureDatabase()
      console.log('[Instrumentation] Database initialized successfully')
    } catch (error) {
      console.error('[Instrumentation] Failed to initialize database:', error)
    }
  }
}
