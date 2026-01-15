/**
 * POST /api/v1/messages
 * Claude 格式的消息端点
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/middleware/auth'
import { incrementApiKeyUsage } from '@/lib/db/api-keys'
import { executeWithRetry, executeStream } from '@/lib/pool/manager'
import * as claudeConverter from '@/lib/converters/claude'
import { KIRO_MODELS } from '@/lib/kiro/constants'
import { getConfig } from '@/lib/config'

export async function POST(request: NextRequest) {
  // 认证
  const auth = await authenticateApiKey(request)
  if (!auth.success) {
    return NextResponse.json(
      claudeConverter.createErrorResponse(auth.error || 'Authentication failed', 'authentication_error'),
      { status: 401 }
    )
  }

  // 解析请求体
  let body: any
  try {
    body = await request.json()
  } catch (e: any) {
    return NextResponse.json(
      claudeConverter.createErrorResponse('Invalid JSON body'),
      { status: 400 }
    )
  }

  const {
    model,
    messages,
    system,
    stream = false,
    max_tokens,
    temperature,
    tools,
  } = body

  // 验证必填字段
  if (!model) {
    return NextResponse.json(
      claudeConverter.createErrorResponse('model is required'),
      { status: 400 }
    )
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      claudeConverter.createErrorResponse('messages is required and must be a non-empty array'),
      { status: 400 }
    )
  }

  if (!max_tokens) {
    return NextResponse.json(
      claudeConverter.createErrorResponse('max_tokens is required'),
      { status: 400 }
    )
  }

  // 检查模型是否支持
  if (!KIRO_MODELS.includes(model)) {
    return NextResponse.json(
      claudeConverter.createErrorResponse(`Model ${model} is not supported`),
      { status: 400 }
    )
  }

  // 转换消息格式
  const kiroMessages = claudeConverter.convertMessagesToKiro(messages, system)

  // 获取配置中的 system prompt
  const config = getConfig()
  const configSystemPrompt = config.systemPrompt || ''

  // 合并 system prompt：配置的 system prompt + 请求中的 system prompt
  let finalSystemPrompt = ''
  if (configSystemPrompt && system) {
    finalSystemPrompt = `${configSystemPrompt}\n\n${system}`
  } else if (configSystemPrompt) {
    finalSystemPrompt = configSystemPrompt
  } else if (system) {
    finalSystemPrompt = system
  }

  // 构建选项
  const options: any = { max_tokens }
  if (temperature !== undefined) options.temperature = temperature

  // 增加 API Key 使用量
  incrementApiKeyUsage(auth.apiKey.id)

  // 构建请求体
  const requestBody: any = {
    messages: kiroMessages,
    ...options,
  }

  // 如果有 system prompt，添加到请求中
  if (finalSystemPrompt) {
    requestBody.system = finalSystemPrompt
  }

  // 如果有 tools，添加到请求中
  if (tools && Array.isArray(tools) && tools.length > 0) {
    requestBody.tools = tools
    console.log('[API] Tools received:', tools.map((t: any) => t.name).join(', '))
  }

  if (stream) {
    // 流式响应
    const encoder = new TextEncoder()

    const streamGenerator = executeStream((service, provider) => {
      return service.streamApi(model, requestBody)
    })

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of claudeConverter.convertStreamToClaude(streamGenerator, model)) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (error: any) {
          console.error('[API] Stream error:', error.message)
          controller.enqueue(
            encoder.encode(
              claudeConverter.createStreamEvent('error', {
                type: 'error',
                error: { type: 'server_error', message: error.message },
              })
            )
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } else {
    // 非流式响应
    try {
      const axiosResponse = await executeWithRetry(async (service, provider) => {
        return service.callApi(model, requestBody)
      })

      // callApi 返回 AxiosResponse，需要提取 data
      const result = axiosResponse.data
      const response = claudeConverter.convertResponseToClaude(result, model)
      return NextResponse.json(response)
    } catch (error: any) {
      console.error('[API] Request error:', error.message)
      return NextResponse.json(
        claudeConverter.createErrorResponse(error.message, 'server_error'),
        { status: 500 }
      )
    }
  }
}
