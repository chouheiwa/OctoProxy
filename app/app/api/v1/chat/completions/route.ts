/**
 * POST /api/v1/chat/completions
 * OpenAI 格式的聊天补全端点
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey } from '@/lib/middleware/auth'
import { incrementApiKeyUsage } from '@/lib/db/api-keys'
import { executeWithRetry, executeStream, ModelNotAvailableError } from '@/lib/pool/manager'
import * as openaiConverter from '@/lib/converters/openai'
import { KIRO_MODELS } from '@/lib/kiro/constants'
import { getConfig } from '@/lib/config'
import { ContextLimitExceededError } from '@/lib/kiro/service'

export async function POST(request: NextRequest) {
  // 认证
  const auth = await authenticateApiKey(request)
  if (!auth.success) {
    return NextResponse.json(
      openaiConverter.createErrorResponse(auth.error || 'Authentication failed', 'authentication_error'),
      { status: 401 }
    )
  }

  // 解析请求体
  let body: any
  try {
    body = await request.json()
  } catch (e: any) {
    return NextResponse.json(
      openaiConverter.createErrorResponse('Invalid JSON body'),
      { status: 400 }
    )
  }

  const { model, messages, stream = false, max_tokens, temperature } = body

  // 验证必填字段
  if (!model) {
    return NextResponse.json(
      openaiConverter.createErrorResponse('model is required'),
      { status: 400 }
    )
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      openaiConverter.createErrorResponse('messages is required and must be a non-empty array'),
      { status: 400 }
    )
  }

  // 检查模型是否支持
  if (!KIRO_MODELS.includes(model)) {
    return NextResponse.json(
      openaiConverter.createErrorResponse(
        `Model ${model} is not supported. Supported models: ${KIRO_MODELS.join(', ')}`
      ),
      { status: 400 }
    )
  }

  // 转换消息格式
  const kiroMessages = openaiConverter.convertMessagesToKiro(messages)

  // 获取配置中的 system prompt
  const config = getConfig()
  const configSystemPrompt = config.systemPrompt || ''

  // 构建选项
  const options: any = {}
  if (max_tokens) options.max_tokens = max_tokens
  if (temperature !== undefined) options.temperature = temperature

  // 增加 API Key 使用量
  incrementApiKeyUsage(auth.apiKey.id)

  // 构建请求体，注入 system prompt
  const requestBody: any = {
    messages: kiroMessages,
    ...options,
  }

  // 如果配置了 system prompt，添加到请求中
  if (configSystemPrompt) {
    requestBody.system = configSystemPrompt
  }

  if (stream) {
    // 流式响应
    const encoder = new TextEncoder()

    const streamGenerator = executeStream((service, provider) => {
      return service.streamApi(model, requestBody)
    }, model)

    // 包装生成器，用于在流开始前捕获错误
    async function* wrappedGenerator() {
      try {
        for await (const chunk of openaiConverter.convertStreamToOpenAI(streamGenerator, model)) {
          yield chunk
        }
      } catch (error: any) {
        // 重新抛出错误，让外层处理
        throw error
      }
    }

    // 尝试获取第一个 chunk，如果失败则直接返回 HTTP 错误
    const generator = wrappedGenerator()
    let firstChunk: string | undefined
    try {
      const result = await generator.next()
      if (!result.done) {
        firstChunk = result.value
      }
    } catch (error: any) {
      console.error('[API] Stream initialization error:', error.message)
      // 模型不可用错误 - 返回 HTTP 400
      if (error instanceof ModelNotAvailableError) {
        return NextResponse.json(error.toOpenAIErrorResponse(), { status: 400 })
      }
      // 上下文超限错误 - 直接返回 HTTP 400
      if (error instanceof ContextLimitExceededError) {
        return NextResponse.json(error.toOpenAIErrorResponse(), { status: 400 })
      }
      // 其他错误 - 返回 HTTP 500
      return NextResponse.json(
        openaiConverter.createErrorResponse(error.message, 'server_error'),
        { status: 500 }
      )
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送第一个 chunk
          if (firstChunk) {
            controller.enqueue(encoder.encode(firstChunk))
          }
          // 继续发送剩余的 chunks
          for await (const chunk of generator) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (error: any) {
          console.error('[API] Stream error:', error.message)
          // 检查是否是模型不可用错误或上下文超限错误
          if (error instanceof ModelNotAvailableError || error instanceof ContextLimitExceededError) {
            controller.enqueue(
              encoder.encode(
                openaiConverter.formatSSE(error.toOpenAIErrorResponse())
              )
            )
          } else {
            controller.enqueue(
              encoder.encode(
                openaiConverter.formatSSE({
                  error: { message: error.message, type: 'server_error' },
                })
              )
            )
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
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
      }, { model })

      // callApi 返回 AxiosResponse，需要提取 data
      const result = axiosResponse.data
      const response = openaiConverter.convertResponseToOpenAI(result, model)
      return NextResponse.json(response)
    } catch (error: any) {
      console.error('[API] Request error:', error.message)
      // 检查是否是模型不可用错误
      if (error instanceof ModelNotAvailableError) {
        return NextResponse.json(error.toOpenAIErrorResponse(), { status: 400 })
      }
      // 检查是否是上下文超限错误
      if (error instanceof ContextLimitExceededError) {
        return NextResponse.json(error.toOpenAIErrorResponse(), { status: 400 })
      }
      return NextResponse.json(
        openaiConverter.createErrorResponse(error.message, 'server_error'),
        { status: 500 }
      )
    }
  }
}
