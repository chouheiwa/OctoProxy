import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import {
  createProvider,
  getProviderByName,
  updateProvider
} from '@/lib/db/providers'

/**
 * POST /api/providers/import - 导入提供商
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()
    const { providers, skipExisting } = body

    if (!providers || !Array.isArray(providers)) {
      return NextResponse.json(
        { error: 'providers array is required' },
        { status: 400 }
      )
    }

    const results = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ index: number; name: string; error: string }>,
    }

    for (let i = 0; i < providers.length; i++) {
      const p = providers[i]

      // 验证必填字段
      if (!p.credentials) {
        results.failed++
        results.errors.push({
          index: i,
          name: p.name || `Provider #${i}`,
          error: 'credentials is required',
        })
        continue
      }

      // 检查是否已存在同名提供商
      if (p.name) {
        const existing = getProviderByName(p.name)
        if (existing) {
          if (skipExisting) {
            results.skipped++
            continue
          } else {
            results.failed++
            results.errors.push({
              index: i,
              name: p.name,
              error: 'Provider with this name already exists',
            })
            continue
          }
        }
      }

      try {
        createProvider({
          name: p.name,
          region: p.region || 'us-east-1',
          credentials:
            typeof p.credentials === 'string'
              ? p.credentials
              : JSON.stringify(p.credentials),
          checkHealth: p.checkHealth !== false,
          checkModelName: p.checkModelName,
        })

        // 如果导入时是禁用状态，则更新
        if (p.isDisabled) {
          const created = getProviderByName(p.name)
          if (created) {
            updateProvider(created.id, { isDisabled: true })
          }
        }

        results.imported++
      } catch (e: any) {
        results.failed++
        results.errors.push({
          index: i,
          name: p.name || `Provider #${i}`,
          error: e.message,
        })
      }
    }

    return NextResponse.json({ success: true, ...results })
  } catch (error: any) {
    console.error('[API] Import providers error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
