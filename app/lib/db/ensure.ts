/**
 * 数据库初始化确保模块
 * 用于 API 路由中确保数据库已初始化
 */

import { ensureDatabase } from './index'

// 缓存初始化 Promise
let initPromise: Promise<void> | null = null
let isInitialized = false

/**
 * 确保数据库已初始化
 * 在 API 路由开始时调用
 */
export async function ensureDbReady(): Promise<void> {
  if (isInitialized) return

  if (!initPromise) {
    initPromise = (async () => {
      try {
        await ensureDatabase()
        isInitialized = true
        console.log('[DB Ensure] Database ready')
      } catch (error) {
        console.error('[DB Ensure] Failed to initialize database:', error)
        initPromise = null // 允许重试
        throw error
      }
    })()
  }

  await initPromise
}

/**
 * 包装 API 处理函数，确保数据库已初始化
 */
export function withDatabase<T extends (...args: any[]) => Promise<Response>>(
  handler: T
): T {
  return (async (...args: Parameters<T>): Promise<Response> => {
    try {
      await ensureDbReady()
      return await handler(...args)
    } catch (error) {
      console.error('[API] Database initialization failed:', error)
      return Response.json(
        { success: false, error: 'Database initialization failed' },
        { status: 500 }
      )
    }
  }) as T
}
