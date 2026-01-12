/**
 * OpenAI 协议转换器
 * 将 Kiro 响应转换为 OpenAI 格式
 */

import { v4 as uuidv4 } from "uuid";

/**
 * 将 OpenAI 格式的消息转换为 Kiro 格式
 * @param {Array} messages OpenAI 格式的消息
 * @returns {Array} Kiro 格式的消息
 */
export function convertMessagesToKiro(messages) {
  return messages.map((msg) => {
    // OpenAI 格式: { role: 'user'|'assistant'|'system', content: string|array }
    // Kiro 格式: { role: 'user'|'assistant', content: string }

    let content = msg.content;

    // 处理多模态内容（数组格式）
    if (Array.isArray(content)) {
      // 提取文本内容
      const textParts = content
        .filter((part) => part.type === "text")
        .map((part) => part.text);
      content = textParts.join("\n");
    }

    // system 消息转换为 user 消息（Kiro 不支持 system role）
    let role = msg.role;
    if (role === "system") {
      role = "user";
      content = `[System]: ${content}`;
    }

    return { role, content };
  });
}

/**
 * 将 Kiro 响应转换为 OpenAI 格式（非流式）
 * @param {Object} kiroResponse Kiro 响应
 * @param {string} model 模型名称
 * @returns {Object} OpenAI 格式响应
 */
export function convertResponseToOpenAI(kiroResponse, model) {
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
 * @param {string} id 响应 ID
 * @param {string} model 模型名称
 * @param {string} content 内容片段
 * @param {string|null} finishReason 结束原因
 * @returns {Object}
 */
export function createStreamChunk(id, model, content, finishReason = null) {
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
 * @param {string} id 响应 ID
 * @param {string} model 模型名称
 * @returns {Object}
 */
export function createInitialChunk(id, model) {
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
 * @param {string} id 响应 ID
 * @param {string} model 模型名称
 * @param {string} finishReason 结束原因
 * @param {Object} usage 使用统计
 * @returns {Object}
 */
export function createFinalChunk(
  id,
  model,
  finishReason = "stop",
  usage = null,
) {
  const created = Math.floor(Date.now() / 1000);

  const chunk = {
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
 * @param {Object|string} data 数据
 * @returns {string}
 */
export function formatSSE(data) {
  if (typeof data === "string") {
    return `data: ${data}\n\n`;
  }
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * 生成 OpenAI 格式的流式响应
 * @param {AsyncGenerator} kiroStream Kiro 流式响应
 * @param {string} model 模型名称
 * @yields {string} SSE 格式的数据
 */
export async function* convertStreamToOpenAI(kiroStream, model) {
  const id = `chatcmpl-${uuidv4().replace(/-/g, "").substring(0, 24)}`;
  let usage = null;
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
  } catch (error) {
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
 * @param {string} message 错误消息
 * @param {string} type 错误类型
 * @param {number} status HTTP 状态码
 * @returns {Object}
 */
export function createErrorResponse(
  message,
  type = "invalid_request_error",
  status = 400,
) {
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
 * @param {Array} models 模型列表
 * @returns {Object}
 */
export function createModelsResponse(models) {
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
