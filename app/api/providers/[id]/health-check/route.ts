import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import { getProviderById } from '@/lib/db/providers'
import { checkProviderHealth } from '@/lib/pool/manager'

/**
 * POST /api/providers/[id]/health-check - 健康检查
 */
export async function POST(
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

    try {
      const isHealthy = await checkProviderHealth(Number(id))
      return NextResponse.json({ success: true, healthy: isHealthy })
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  } catch (error: any) {
    console.error('[API] Health check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
