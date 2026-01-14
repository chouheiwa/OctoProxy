import { NextRequest, NextResponse } from 'next/server'
import { authenticateSession } from '@/lib/middleware/auth'
import {
  getApiKeyById,
  updateApiKey,
  deleteApiKey,
} from '@/lib/db/api-keys'

/**
 * GET /api/api-keys/:id - 获取单个 API Key
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 验证 session
  const auth = await authenticateSession(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key ID' },
        { status: 400 }
      )
    }

    const apiKey = getApiKeyById(id)
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API Key not found' },
        { status: 404 }
      )
    }

    // 检查权限：管理员或自己的 key
    if (auth.user?.role !== 'admin' && apiKey.user_id !== auth.user?.id) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ success: true, apiKey })
  } catch (error: any) {
    console.error('[API] Get API key error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get API key' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/api-keys/:id - 更新 API Key
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 验证 session
  const auth = await authenticateSession(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key ID' },
        { status: 400 }
      )
    }

    const existing = getApiKeyById(id)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'API Key not found' },
        { status: 404 }
      )
    }

    // 检查权限：管理员或自己的 key
    if (auth.user?.role !== 'admin' && existing.user_id !== auth.user?.id) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()

    // 更新 API Key
    const apiKey = updateApiKey(id, body)

    return NextResponse.json({ success: true, apiKey })
  } catch (error: any) {
    console.error('[API] Update API key error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update API key' },
      { status: 400 }
    )
  }
}

/**
 * DELETE /api/api-keys/:id - 删除 API Key
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 验证 session
  const auth = await authenticateSession(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key ID' },
        { status: 400 }
      )
    }

    const existing = getApiKeyById(id)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'API Key not found' },
        { status: 404 }
      )
    }

    // 检查权限：管理员或自己的 key
    if (auth.user?.role !== 'admin' && existing.user_id !== auth.user?.id) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Electron Auto Key 不能被删除，只能禁用
    if (existing.name === 'Electron Auto Key') {
      return NextResponse.json(
        { success: false, error: 'Electron Auto Key cannot be deleted, only disabled' },
        { status: 403 }
      )
    }

    const deleted = deleteApiKey(id)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete API key' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, message: 'API Key deleted successfully' })
  } catch (error: any) {
    console.error('[API] Delete API key error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete API key' },
      { status: 500 }
    )
  }
}
