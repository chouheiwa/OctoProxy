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
  toolUse?: {
    toolUseId: string;
    name: string;
    input?: string | object;
    stop?: boolean;
  };
  input?: string;
  stop?: boolean;
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
      const contentParts: string[] = [];

      for (const part of content) {
        if (part.type === "text" && part.text) {
          contentParts.push(part.text);
        } else if (part.type === "tool_use") {
          // 工具调用：转换为可读格式
          const toolUse = part as any;
          const inputStr = typeof toolUse.input === 'string'
            ? toolUse.input
            : JSON.stringify(toolUse.input || {});
          const toolId = toolUse.id ? `(${toolUse.id}) ` : '';
          contentParts.push(`[Called ${toolUse.name} ${toolId}with args: ${inputStr}]`);
        } else if (part.type === "tool_result") {
          // 工具结果：转换为可读格式
          const toolResult = part as any;
          let resultContent = '';
          if (typeof toolResult.content === 'string') {
            resultContent = toolResult.content;
          } else if (Array.isArray(toolResult.content)) {
            resultContent = toolResult.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n');
          }
          const errorPrefix = toolResult.is_error ? '[Error] ' : '';
          const toolId = toolResult.tool_use_id ? `(${toolResult.tool_use_id}) ` : '';
          contentParts.push(`[Tool result ${toolId}${errorPrefix}: ${resultContent}]`);
        }
      }

      content = contentParts.join("\n");
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
 * 创建 content_block_start 事件 (文本类型)
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
 * 创建 tool_use content_block_start 事件
 */
export function createToolUseBlockStart(
  index: number,
  toolUseId: string,
  name: string
): string {
  return createStreamEvent("content_block_start", {
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id: toolUseId,
      name: name,
      input: {},
    },
  });
}

/**
 * 创建 tool_use input_json_delta 事件
 */
export function createToolUseInputDelta(
  index: number,
  partialJson: string
): string {
  return createStreamEvent("content_block_delta", {
    type: "content_block_delta",
    index,
    delta: {
      type: "input_json_delta",
      partial_json: partialJson,
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
 * 工具调用收集接口
 */
interface CollectedToolCall {
  toolUseId: string;
  name: string;
  input: string;
}

/**
 * 生成 Claude 格式的流式响应
 * 采用参考实现的策略：先收集所有工具调用，在流结束后统一发送
 */
export async function* convertStreamToClaude(
  kiroStream: AsyncGenerator<KiroStreamEvent>,
  model: string
): AsyncGenerator<string> {
  const id = `msg_${uuidv4().replace(/-/g, "").substring(0, 24)}`;
  let usage: Usage | null = null;
  let stopReason = "end_turn";
  let contentStarted = false;
  let textBlockIndex = 0;

  // 工具调用收集
  const toolCalls: CollectedToolCall[] = [];
  let currentToolCall: CollectedToolCall | null = null;

  // 发送 message_start
  yield createMessageStart(id, model);

  try {
    for await (const event of kiroStream) {
      // 调试日志：打印 Kiro 返回的事件
      if (event.type !== "content") {
        console.log("[Claude Converter] Kiro event:", JSON.stringify(event));
      }

      // Kiro 返回的事件格式: { type: "content", content: "..." }
      if (event.type === "content" && event.content) {
        // 首次收到内容时发送 content_block_start
        if (!contentStarted) {
          yield createContentBlockStart(textBlockIndex);
          contentStarted = true;
        }
        yield createContentBlockDelta(textBlockIndex, event.content);
      } else if (event.type === "toolUse" && (event as any).toolUse) {
        // 工具调用事件 - 收集但不立即发送
        const toolData = (event as any).toolUse;

        if (toolData.name && toolData.toolUseId) {
          // 检查是否是同一个工具调用的续传
          if (currentToolCall && currentToolCall.toolUseId === toolData.toolUseId) {
            // 同一个工具调用，累积 input
            currentToolCall.input += toolData.input || '';
          } else {
            // 不同的工具调用
            // 如果有未完成的工具调用，先保存它
            if (currentToolCall) {
              toolCalls.push(currentToolCall);
            }
            // 开始新的工具调用
            currentToolCall = {
              toolUseId: toolData.toolUseId,
              name: toolData.name,
              input: typeof toolData.input === 'string' ? toolData.input : JSON.stringify(toolData.input || {}),
            };
          }
          // 如果这个事件包含 stop，完成工具调用
          if (toolData.stop) {
            toolCalls.push(currentToolCall);
            currentToolCall = null;
          }
        }
      } else if (event.type === "toolUseInput" && (event as any).input !== undefined) {
        // 工具输入增量 - 累积到当前工具调用
        if (currentToolCall) {
          currentToolCall.input += (event as any).input || '';
        }
      } else if (event.type === "toolUseStop") {
        // 工具调用结束 - 保存当前工具调用
        // toolUseStop 事件本身就表示结束，不需要额外检查 stop 值
        if (currentToolCall) {
          toolCalls.push(currentToolCall);
          currentToolCall = null;
        }
      } else if (event.type === "contextUsage") {
        // 上下文使用百分比，可用于估算 token
        // 暂时忽略
      }
    }
  } catch (error: any) {
    console.error("[Claude Converter] Stream error:", error.message);
    stopReason = "error";
  }

  // 处理未完成的工具调用（如果流提前结束）
  if (currentToolCall) {
    toolCalls.push(currentToolCall);
    currentToolCall = null;
  }

  // 关闭文本内容块
  if (contentStarted) {
    yield createContentBlockStop(textBlockIndex);
  }

  // 在流结束后统一发送所有工具调用事件
  if (toolCalls.length > 0) {
    console.log("[Claude Converter] Sending tool calls:", toolCalls.map(tc => tc.name).join(', '));

    const baseIndex = textBlockIndex + (contentStarted ? 1 : 0);
    for (let i = 0; i < toolCalls.length; i++) {
      const tc = toolCalls[i];
      const blockIndex = baseIndex + i;

      // 解析 input 为对象（如果是字符串的话）
      let inputJson: string;
      if (typeof tc.input === 'string') {
        try {
          // 尝试解析并重新序列化，确保格式正确
          const parsed = JSON.parse(tc.input);
          inputJson = JSON.stringify(parsed);
        } catch {
          // 如果解析失败，使用空对象
          inputJson = tc.input || '{}';
        }
      } else {
        inputJson = JSON.stringify(tc.input || {});
      }

      console.log(`[Claude Converter] Tool call ${i}: ${tc.name} (${tc.toolUseId}), input: ${inputJson.substring(0, 100)}...`);

      // 发送 content_block_start
      yield createToolUseBlockStart(blockIndex, tc.toolUseId, tc.name);
      // 发送完整的 input_json_delta
      yield createToolUseInputDelta(blockIndex, inputJson);
      // 发送 content_block_stop
      yield createContentBlockStop(blockIndex);
    }

    stopReason = "tool_use";
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
  createToolUseBlockStart,
  createToolUseInputDelta,
  createContentBlockDelta,
  createContentBlockStop,
  createMessageDelta,
  createMessageStop,
  createPing,
  convertStreamToClaude,
  createErrorResponse,
};
