import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import {
  getProviderById,
  updateProvider,
  deleteProvider,
} from '@/lib/db/providers'

/**
 * GET /api/providers/:id - 获取单个提供商
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 验证管理员权限
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid provider ID' },
        { status: 400 }
      )
    }

    const provider = getProviderById(id)
    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'Provider not found' },
        { status: 404 }
      )
    }

    // 不返回凭据信息
    const { credentials, ...safeProvider } = provider

    return NextResponse.json({ success: true, provider: safeProvider })
  } catch (error: any) {
    console.error('[API] Get provider error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get provider' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/providers/:id - 更新提供商
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 验证管理员权限
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid provider ID' },
        { status: 400 }
      )
    }

    const body = await request.json()

    // 如果更新凭据，确保是字符串
    if (body.credentials && typeof body.credentials !== 'string') {
      body.credentials = JSON.stringify(body.credentials)
    }

    const provider = updateProvider(id, body)
    if (!provider) {
      return NextResponse.json(
        { success: false, error: 'Provider not found' },
        { status: 404 }
      )
    }

    // 不返回凭据信息
    const { credentials, ...safeProvider } = provider

    return NextResponse.json({ success: true, provider: safeProvider })
  } catch (error: any) {
    console.error('[API] Update provider error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update provider' },
      { status: 400 }
    )
  }
}

/**
 * DELETE /api/providers/:id - 删除提供商
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 验证管理员权限
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const { id: idStr } = await params
    const id = parseInt(idStr, 10)
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid provider ID' },
        { status: 400 }
      )
    }

    const deleted = deleteProvider(id)
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Provider not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: 'Provider deleted successfully' })
  } catch (error: any) {
    console.error('[API] Delete provider error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete provider' },
      { status: 500 }
    )
  }
}
