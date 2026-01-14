import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession } from '@/lib/middleware/auth'
import { getApiKeyById, updateApiKey, deleteApiKey } from '@/lib/db/api-keys'

/**
 * GET /api/api-keys/[id] - 获取指定 API Key
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateSession(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid API key ID' }, { status: 400 })
    }

    const apiKey = getApiKeyById(id)
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key not found' }, { status: 404 })
    }

    // 检查权限 - 非管理员只能访问自己的
    if (auth.user?.role !== 'admin' && apiKey.user_id !== auth.session?.user_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ success: true, apiKey })
  } catch (error: any) {
    console.error('[API] Get API key error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/api-keys/[id] - 更新 API Key
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateSession(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid API key ID' }, { status: 400 })
    }

    const existing = getApiKeyById(id)
    if (!existing) {
      return NextResponse.json({ error: 'API Key not found' }, { status: 404 })
    }

    // 检查权限 - 非管理员只能修改自己的
    if (auth.user?.role !== 'admin' && existing.user_id !== auth.session?.user_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const apiKey = updateApiKey(id, body)

    return NextResponse.json({ success: true, apiKey })
  } catch (error: any) {
    console.error('[API] Update API key error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/api-keys/[id] - 删除 API Key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateSession(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid API key ID' }, { status: 400 })
    }

    const existing = getApiKeyById(id)
    if (!existing) {
      return NextResponse.json({ error: 'API Key not found' }, { status: 404 })
    }

    // 检查权限 - 非管理员只能删除自己的
    if (auth.user?.role !== 'admin' && existing.user_id !== auth.session?.user_id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Electron Auto Key 不能被删除，只能禁用
    if (existing.name === 'Electron Auto Key') {
      return NextResponse.json(
        { error: 'Electron Auto Key cannot be deleted, only disabled' },
        { status: 403 }
      )
    }

    deleteApiKey(id)
    return NextResponse.json({ success: true, message: 'API Key deleted successfully' })
  } catch (error: any) {
    console.error('[API] Delete API key error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
