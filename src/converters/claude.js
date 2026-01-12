/**
 * Claude 协议转换器
 * Kiro 原生响应与 Claude API 格式非常接近，主要做格式适配
 */

import { v4 as uuidv4 } from "uuid";

/**
 * 将 Claude 格式的消息转换为 Kiro 格式
 * @param {Array} messages Claude 格式的消息
 * @param {string} system 系统提示（可选）
 * @returns {Array} Kiro 格式的消息
 */
export function convertMessagesToKiro(messages, system = null) {
  const result = [];

  // 如果有 system 提示，添加为第一条 user 消息
  if (system) {
    result.push({
      role: "user",
      content: `[System]: ${system}`,
    });
    // 添加一个空的 assistant 响应来保持对话流
    result.push({
      role: "assistant",
      content: "Understood.",
    });
  }

  for (const msg of messages) {
    let content = msg.content;

    // 处理多模态内容（数组格式）
    if (Array.isArray(content)) {
      const textParts = content
        .filter((part) => part.type === "text")
        .map((part) => part.text);
      content = textParts.join("\n");
    }

    result.push({
      role: msg.role,
      content,
    });
  }

  return result;
}

/**
 * 将 Kiro 响应转换为 Claude 格式（非流式）
 * @param {Object} kiroResponse Kiro 响应
 * @param {string} model 模型名称
 * @returns {Object} Claude 格式响应
 */
export function convertResponseToClaude(kiroResponse, model) {
  const id = `msg_${uuidv4().replace(/-/g, "").substring(0, 24)}`;

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
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: content,
      },
    ],
    model,
    stop_reason: kiroResponse.stop_reason || "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  };
}

/**
 * 创建 Claude 流式事件
 * @param {string} type 事件类型
 * @param {Object} data 事件数据
 * @returns {string} SSE 格式的事件
 */
export function createStreamEvent(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * 创建 message_start 事件
 * @param {string} id 消息 ID
 * @param {string} model 模型名称
 * @returns {string}
 */
export function createMessageStart(id, model) {
  return createStreamEvent("message_start", {
    type: "message_start",
    message: {
      id,
      type: "message",
      role: "assistant",
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
      },
    },
  });
}

/**
 * 创建 content_block_start 事件
 * @param {number} index 块索引
 * @returns {string}
 */
export function createContentBlockStart(index = 0) {
  return createStreamEvent("content_block_start", {
    type: "content_block_start",
    index,
    content_block: {
      type: "text",
      text: "",
    },
  });
}

/**
 * 创建 content_block_delta 事件
 * @param {number} index 块索引
 * @param {string} text 文本增量
 * @returns {string}
 */
export function createContentBlockDelta(index, text) {
  return createStreamEvent("content_block_delta", {
    type: "content_block_delta",
    index,
    delta: {
      type: "text_delta",
      text,
    },
  });
}

/**
 * 创建 content_block_stop 事件
 * @param {number} index 块索引
 * @returns {string}
 */
export function createContentBlockStop(index = 0) {
  return createStreamEvent("content_block_stop", {
    type: "content_block_stop",
    index,
  });
}

/**
 * 创建 message_delta 事件
 * @param {string} stopReason 停止原因
 * @param {Object} usage 使用统计
 * @returns {string}
 */
export function createMessageDelta(stopReason = "end_turn", usage = null) {
  return createStreamEvent("message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: stopReason,
      stop_sequence: null,
    },
    usage: usage
      ? {
          output_tokens: usage.output_tokens || 0,
        }
      : {
          output_tokens: 0,
        },
  });
}

/**
 * 创建 message_stop 事件
 * @returns {string}
 */
export function createMessageStop() {
  return createStreamEvent("message_stop", {
    type: "message_stop",
  });
}

/**
 * 创建 ping 事件
 * @returns {string}
 */
export function createPing() {
  return createStreamEvent("ping", {
    type: "ping",
  });
}

/**
 * 生成 Claude 格式的流式响应
 * @param {AsyncGenerator} kiroStream Kiro 流式响应
 * @param {string} model 模型名称
 * @yields {string} SSE 格式的事件
 */
export async function* convertStreamToClaude(kiroStream, model) {
  const id = `msg_${uuidv4().replace(/-/g, "").substring(0, 24)}`;
  let usage = null;
  let stopReason = "end_turn";
  let contentStarted = false;

  // 发送 message_start
  yield createMessageStart(id, model);

  try {
    for await (const event of kiroStream) {
      // Kiro 返回的事件格式: { type: "content", content: "..." }
      if (event.type === "content" && event.content) {
        // 首次收到内容时发送 content_block_start
        if (!contentStarted) {
          yield createContentBlockStart(0);
          contentStarted = true;
        }
        yield createContentBlockDelta(0, event.content);
      } else if (event.type === "contextUsage") {
        // 上下文使用百分比，可用于估算 token
        // 暂时忽略
      } else if (event.type === "toolUse") {
        // 工具调用 - 暂不支持
      }
    }
  } catch (error) {
    console.error("[Claude Converter] Stream error:", error.message);
    stopReason = "error";
  }

  // 如果有内容，发送 content_block_stop
  if (contentStarted) {
    yield createContentBlockStop(0);
  }

  // 发送 message_delta 和 message_stop
  yield createMessageDelta(stopReason, usage);
  yield createMessageStop();
}

/**
 * 创建 Claude 格式的错误响应
 * @param {string} message 错误消息
 * @param {string} type 错误类型
 * @returns {Object}
 */
export function createErrorResponse(message, type = "invalid_request_error") {
  return {
    type: "error",
    error: {
      type,
      message,
    },
  };
}

export default {
  convertMessagesToKiro,
  convertResponseToClaude,
  createStreamEvent,
  createMessageStart,
  createContentBlockStart,
  createContentBlockDelta,
  createContentBlockStop,
  createMessageDelta,
  createMessageStop,
  createPing,
  convertStreamToClaude,
  createErrorResponse,
};
