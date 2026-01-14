import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import {
  getProviderById,
  updateProvider,
  deleteProvider
} from '@/lib/db/providers'

/**
 * GET /api/providers/[id] - 获取单个提供商
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { id } = await params
    const provider = getProviderById(Number(id))
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    // 安全过滤：不返回 credentials
    const { credentials, ...safe } = provider
    return NextResponse.json({ success: true, provider: safe })
  } catch (error: any) {
    console.error('[API] Get provider error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/providers/[id] - 更新提供商
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const body = await request.json()

    // 如果更新 credentials，确保是字符串
    if (body.credentials && typeof body.credentials !== 'string') {
      body.credentials = JSON.stringify(body.credentials)
    }

    const { id } = await params
    const provider = updateProvider(Number(id), body)
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    // 安全过滤：不返回 credentials
    const { credentials, ...safe } = provider
    return NextResponse.json({ success: true, provider: safe })
  } catch (error: any) {
    console.error('[API] Update provider error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/providers/[id] - 删除提供商
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateAdmin(request)
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 })
    }

    const { id } = await params
    const deleted = deleteProvider(Number(id))
    if (!deleted) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'Provider deleted successfully'
    })
  } catch (error: any) {
    console.error('[API] Delete provider error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
