/**
 * OpenAI 协议转换器
 * 将 Kiro 响应转换为 OpenAI 格式
 */

import { v4 as uuidv4 } from "uuid";

/**
 * OpenAI 消息接口
 */
export interface OpenAIMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<{ type: string; text?: string }>;
}

/**
 * Kiro 消息接口
 */
export interface KiroMessage {
  role: string;
  content: string;
}

/**
 * OpenAI 响应接口
 */
export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    logprobs: null;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI 流式 Chunk 接口
 */
export interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    logprobs: null;
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 错误响应接口
 */
export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    param: null;
    code: null;
  };
}

/**
 * 用量接口
 */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Kiro 响应接口
 */
export interface KiroResponse {
  content?: string;
  stop_reason?: string;
  usage?: Usage;
}

/**
 * Kiro 流式事件接口
 */
export interface KiroStreamEvent {
  type: string;
  data?: {
    delta?: {
      text?: string;
    };
    stopReason?: string;
    usage?: Usage;
  };
}

/**
 * 将 OpenAI 格式的消息转换为 Kiro 格式
 */
export function convertMessagesToKiro(messages: OpenAIMessage[]): KiroMessage[] {
  return messages.map((msg) => {
    let content = msg.content;

    // 处理多模态内容（数组格式）
    if (Array.isArray(content)) {
      // 提取文本内容
      const textParts = content
        .filter((part) => part.type === "text")
        .map((part) => part.text || "");
      content = textParts.join("\n");
    }

    // system 消息转换为 user 消息（Kiro 不支持 system role）
    let role = msg.role;
    if (role === "system") {
      role = "user";
      content = `[System]: ${content}`;
    }

    return { role, content: content as string };
  });
}

/**
 * 将 Kiro 响应转换为 OpenAI 格式（非流式）
 */
export function convertResponseToOpenAI(
  kiroResponse: KiroResponse,
  model: string
): OpenAIResponse {
  const id = `chatcmpl-${uuidv4().replace(/-/g, "").substring(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  // 提取内容
  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;

  if (kiroResponse.content) {
    content = kiroResponse.content;
  }

  if (kiroResponse.usage) {
    inputTokens = kiroResponse.usage.input_tokens || 0;
    outputTokens = kiroResponse.usage.output_tokens || 0;
  }

  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        logprobs: null,
        finish_reason: kiroResponse.stop_reason || "stop",
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}

/**
 * 创建 OpenAI 流式响应的 chunk
 */
export function createStreamChunk(
  id: string,
  model: string,
  content: string | null,
  finishReason: string | null = null
): OpenAIStreamChunk {
  const created = Math.floor(Date.now() / 1000);

  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: content !== null ? { content } : {},
        logprobs: null,
        finish_reason: finishReason,
      },
    ],
  };
}

/**
 * 创建流式响应的初始 chunk（包含 role）
 */
export function createInitialChunk(id: string, model: string): OpenAIStreamChunk {
  const created = Math.floor(Date.now() / 1000);

  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: "" },
        logprobs: null,
        finish_reason: null,
      },
    ],
  };
}

/**
 * 创建流式响应的结束 chunk
 */
export function createFinalChunk(
  id: string,
  model: string,
  finishReason: string = "stop",
  usage: Usage | null = null
): OpenAIStreamChunk {
  const created = Math.floor(Date.now() / 1000);

  const chunk: OpenAIStreamChunk = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        logprobs: null,
        finish_reason: finishReason,
      },
    ],
  };

  if (usage) {
    chunk.usage = {
      prompt_tokens: usage.input_tokens || 0,
      completion_tokens: usage.output_tokens || 0,
      total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    };
  }

  return chunk;
}

/**
 * 格式化 SSE 数据
 */
export function formatSSE(data: any | string): string {
  if (typeof data === "string") {
    return `data: ${data}\n\n`;
  }
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * 生成 OpenAI 格式的流式响应
 */
export async function* convertStreamToOpenAI(
  kiroStream: AsyncGenerator<KiroStreamEvent>,
  model: string
): AsyncGenerator<string> {
  const id = `chatcmpl-${uuidv4().replace(/-/g, "").substring(0, 24)}`;
  let usage: Usage | null = null;
  let finishReason = "stop";

  // 发送初始 chunk
  yield formatSSE(createInitialChunk(id, model));

  try {
    for await (const event of kiroStream) {
      if (event.type === "contentBlockDelta") {
        // 内容增量
        const content = event.data?.delta?.text || "";
        if (content) {
          yield formatSSE(createStreamChunk(id, model, content, null));
        }
      } else if (event.type === "messageStop") {
        // 消息结束
        finishReason = event.data?.stopReason || "stop";
      } else if (event.type === "metadata") {
        // 元数据（包含 usage）
        if (event.data?.usage) {
          usage = event.data.usage;
        }
      }
    }
  } catch (error: any) {
    // 发送错误信息
    console.error("[OpenAI Converter] Stream error:", error.message);
    finishReason = "error";
  }

  // 发送结束 chunk
  yield formatSSE(createFinalChunk(id, model, finishReason, usage));
  yield "data: [DONE]\n\n";
}

/**
 * 创建 OpenAI 格式的错误响应
 */
export function createErrorResponse(
  message: string,
  type: string = "invalid_request_error",
  status: number = 400
): ErrorResponse {
  return {
    error: {
      message,
      type,
      param: null,
      code: null,
    },
  };
}

/**
 * 创建模型列表响应
 */
export function createModelsResponse(models: string[]): {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
} {
  return {
    object: "list",
    data: models.map((model) => ({
      id: model,
      object: "model",
      created: 1700000000,
      owned_by: "octo-proxy",
    })),
  };
}

export default {
  convertMessagesToKiro,
  convertResponseToOpenAI,
  createStreamChunk,
  createInitialChunk,
  createFinalChunk,
  formatSSE,
  convertStreamToOpenAI,
  createErrorResponse,
  createModelsResponse,
};
