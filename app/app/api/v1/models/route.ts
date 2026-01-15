/**
 * GET /api/v1/models
 * 获取可用模型列表 (OpenAI 格式)
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/middleware/auth'
import * as openaiConverter from '@/lib/converters/openai'
import { KIRO_MODELS } from '@/lib/kiro/constants'

export async function GET(request: NextRequest) {
  // 认证
  const auth = await authenticateApiKey(request)
  if (!auth.success) {
    return NextResponse.json(
      openaiConverter.createErrorResponse(auth.error || 'Authentication failed', 'authentication_error'),
      { status: 401 }
    )
  }

  // 返回模型列表
  const response = openaiConverter.createModelsResponse(KIRO_MODELS)
  return NextResponse.json(response)
}
