/**
 * Claude 协议转换器
 * Kiro 原生响应与 Claude API 格式非常接近，主要做格式适配
 */

import { v4 as uuidv4 } from "uuid";

/**
 * Claude 消息接口
 */
export interface ClaudeMessage {
  role: string;
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
 * Claude 响应接口
 */
export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: null;
  usage: {
    input_tokens: number;
    output_tokens: number;
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
  content?: string;
  percentage?: number;
}

/**
 * 错误响应接口
 */
export interface ErrorResponse {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

/**
 * 将 Claude 格式的消息转换为 Kiro 格式
 */
export function convertMessagesToKiro(
  messages: ClaudeMessage[],
  system: string | null = null
): KiroMessage[] {
  const result: KiroMessage[] = [];

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
        .map((part) => part.text || "");
      content = textParts.join("\n");
    }

    result.push({
      role: msg.role,
      content: content as string,
    });
  }

  return result;
}

/**
 * 将 Kiro 响应转换为 Claude 格式（非流式）
 */
export function convertResponseToClaude(
  kiroResponse: KiroResponse,
  model: string
): ClaudeResponse {
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
 */
export function createStreamEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * 创建 message_start 事件
 */
export function createMessageStart(id: string, model: string): string {
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
 */
export function createContentBlockStart(index: number = 0): string {
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
 */
export function createContentBlockDelta(index: number, text: string): string {
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
 */
export function createContentBlockStop(index: number = 0): string {
  return createStreamEvent("content_block_stop", {
    type: "content_block_stop",
    index,
  });
}

/**
 * 创建 message_delta 事件
 */
export function createMessageDelta(
  stopReason: string = "end_turn",
  usage: Usage | null = null
): string {
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
 */
export function createMessageStop(): string {
  return createStreamEvent("message_stop", {
    type: "message_stop",
  });
}

/**
 * 创建 ping 事件
 */
export function createPing(): string {
  return createStreamEvent("ping", {
    type: "ping",
  });
}

/**
 * 生成 Claude 格式的流式响应
 */
export async function* convertStreamToClaude(
  kiroStream: AsyncGenerator<KiroStreamEvent>,
  model: string
): AsyncGenerator<string> {
  const id = `msg_${uuidv4().replace(/-/g, "").substring(0, 24)}`;
  let usage: Usage | null = null;
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
  } catch (error: any) {
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
 */
export function createErrorResponse(
  message: string,
  type: string = "invalid_request_error"
): ErrorResponse {
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
