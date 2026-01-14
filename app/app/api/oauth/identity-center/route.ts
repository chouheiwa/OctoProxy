import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdmin } from '@/lib/middleware/auth'
import {
  startIdCAuth,
  validateStartUrl,
  SUPPORTED_IDC_REGIONS,
} from '@/lib/kiro/oauth'

/**
 * POST /api/oauth/identity-center - 启动 IAM Identity Center 认证流程
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request)
  if (!auth.success) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { startUrl, region = 'us-east-1' } = body

    // 验证 startUrl
    if (!startUrl) {
      return NextResponse.json(
        { success: false, error: 'Start URL is required' },
        { status: 400 }
      )
    }

    if (!validateStartUrl(startUrl)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Invalid Start URL format. Expected format: https://d-xxxxxxxxx.awsapps.com/start',
        },
        { status: 400 }
      )
    }

    // 验证 region
    if (!SUPPORTED_IDC_REGIONS.includes(region)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported region: ${region}. Supported regions: ${SUPPORTED_IDC_REGIONS.join(', ')}`,
        },
        { status: 400 }
      )
    }

    const result = await startIdCAuth(startUrl, region)

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      userCode: result.userCode,
      authUrl: result.authUrl,
      expiresIn: result.expiresIn,
    })
  } catch (error: any) {
    console.error('[API] Start IAM Identity Center auth error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to start IAM Identity Center auth',
      },
      { status: 500 }
    )
  }
}
