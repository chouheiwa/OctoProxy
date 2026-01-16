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
 * 括号匹配函数 - 用于解析嵌套的 JSON 结构
 */
function findMatchingBracket(
  text: string,
  startPos: number,
  openChar: string = "[",
  closeChar: string = "]"
): number {
  if (!text || startPos >= text.length || text[startPos] !== openChar)
    return -1;

  let bracketCount = 1;
  let inString = false;
  let escapeNext = false;

  for (let i = startPos + 1; i < text.length; i++) {
    const char = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\" && inString) {
      escapeNext = true;
      continue;
    }
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === openChar) bracketCount++;
      else if (char === closeChar) {
        bracketCount--;
        if (bracketCount === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * 修复 JSON 格式问题
 */
function repairJson(jsonStr: string): string {
  let repaired = jsonStr;
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  repaired = repaired.replace(/([{,]\s*)([a-zA-Z0-9_]+?)\s*:/g, '$1"$2":');
  return repaired;
}

/**
 * 生成符合 Anthropic 格式的 tool_use ID
 * 格式: toolu_01XXXXXXXXXXXXXXXXXXXXXX (toolu_ + 24个字符)
 */
function generateToolUseId(): string {
  return `toolu_${uuidv4().replace(/-/g, "").substring(0, 24)}`;
}

/**
 * 标准化 tool_use ID 格式
 * Anthropic API 期望格式: toolu_XXXXXXXXXXXXXXXXXXXXXXXX
 */
function normalizeToolUseId(rawId: string | undefined): string {
  if (!rawId) {
    return generateToolUseId();
  }

  // 如果已经是 toolu_ 格式，直接返回
  if (rawId.startsWith('toolu_')) {
    return rawId;
  }

  // 如果是其他格式（如 tooluse_xxx），转换为 toolu_ 格式
  // 提取数字/字母部分，生成新的 ID
  const alphanumeric = rawId.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length >= 24) {
    return `toolu_${alphanumeric.substring(0, 24)}`;
  }

  // 如果提取的字符不够，补充随机字符
  const padding = uuidv4().replace(/-/g, '').substring(0, 24 - alphanumeric.length);
  return `toolu_${alphanumeric}${padding}`;
}

/**
 * 解析单个文本格式的工具调用
 * 支持格式: [Called ToolName (tooluse_xxx) with args: {...}]
 */
function parseSingleBracketToolCall(toolCallText: string): CollectedToolCall | null {
  // 匹配工具名称和可选的 toolUseId
  const namePattern = /\[Called\s+(\w+)\s*(?:\(([^)]+)\))?\s*with\s+args:/i;
  const nameMatch = toolCallText.match(namePattern);
  if (!nameMatch) {
    console.log("[Claude Converter] Failed to match tool call pattern:", toolCallText.substring(0, 100));
    return null;
  }

  const toolName = nameMatch[1].trim();
  // 标准化 tool_use ID 格式
  const toolUseId = normalizeToolUseId(nameMatch[2]?.trim());

  const argsStartMarker = "with args:";
  const argsStartPos = toolCallText
    .toLowerCase()
    .indexOf(argsStartMarker.toLowerCase());
  if (argsStartPos === -1) return null;

  const argsStart = argsStartPos + argsStartMarker.length;
  const argsEnd = toolCallText.lastIndexOf("]");
  if (argsEnd <= argsStart) return null;

  const jsonCandidate = toolCallText.substring(argsStart, argsEnd).trim();

  try {
    const repairedJson = repairJson(jsonCandidate);
    const argumentsObj = JSON.parse(repairedJson);
    if (typeof argumentsObj !== "object" || argumentsObj === null) {
      // 解析成功但不是对象，使用原始字符串
      console.log(`[Claude Converter] Parsed non-object for ${toolName}, using raw input`);
      return {
        toolUseId,
        name: toolName,
        input: jsonCandidate,
      };
    }

    console.log(`[Claude Converter] Successfully parsed tool call: ${toolName} (${toolUseId})`);
    return {
      toolUseId,
      name: toolName,
      input: JSON.stringify(argumentsObj),
    };
  } catch (e: any) {
    // JSON 解析失败，但仍然返回工具调用（使用原始字符串作为 input）
    console.log(`[Claude Converter] JSON parse failed for ${toolName}: ${e.message}, using raw input`);
    return {
      toolUseId,
      name: toolName,
      input: jsonCandidate,
    };
  }
}

/**
 * 从文本内容中解析所有 bracket 格式的工具调用
 * 格式: [Called ToolName (tooluse_xxx) with args: {...}]
 */
function parseBracketToolCalls(responseText: string): CollectedToolCall[] {
  if (!responseText || !responseText.includes("[Called")) return [];

  const toolCalls: CollectedToolCall[] = [];
  let searchPos = 0;

  while (searchPos < responseText.length) {
    // 查找下一个 [Called
    const callStart = responseText.indexOf("[Called", searchPos);
    if (callStart === -1) break;

    // 从 callStart 位置开始，查找匹配的结束括号
    const segment = responseText.substring(callStart);
    const bracketEnd = findMatchingBracket(segment, 0);

    if (bracketEnd === -1) {
      // 没有找到匹配的结束括号，尝试查找最后一个 ]
      const lastBracket = segment.indexOf("]");
      if (lastBracket === -1) {
        // 完全没有结束括号，跳过
        searchPos = callStart + "[Called".length;
        continue;
      }
      // 使用找到的第一个 ] 作为结束位置
      const toolCallText = segment.substring(0, lastBracket + 1);
      const parsedCall = parseSingleBracketToolCall(toolCallText);
      if (parsedCall) {
        toolCalls.push(parsedCall);
        console.log(`[Claude Converter] Parsed tool call at pos ${callStart}: ${parsedCall.name}(${parsedCall.toolUseId})`);
      }
      searchPos = callStart + lastBracket + 1;
    } else {
      // 找到匹配的结束括号
      const toolCallText = segment.substring(0, bracketEnd + 1);
      const parsedCall = parseSingleBracketToolCall(toolCallText);
      if (parsedCall) {
        toolCalls.push(parsedCall);
        console.log(`[Claude Converter] Parsed tool call at pos ${callStart}: ${parsedCall.name}(${parsedCall.toolUseId})`);
      }
      searchPos = callStart + bracketEnd + 1;
    }
  }

  return toolCalls;
}

/**
 * 去重工具调用 - 基于 name + input 组合
 */
function deduplicateToolCalls(toolCalls: CollectedToolCall[]): CollectedToolCall[] {
  const seen = new Set<string>();
  const uniqueToolCalls: CollectedToolCall[] = [];
  for (const tc of toolCalls) {
    const key = `${tc.name}-${tc.input}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueToolCalls.push(tc);
    }
  }
  return uniqueToolCalls;
}

/**
 * 从文本中移除已解析的工具调用文本
 */
function removeToolCallsFromText(text: string): string {
  if (!text || !text.includes("[Called")) return text;

  // 移除所有 [Called ... ] 格式的文本
  let result = text;
  const callPositions: number[] = [];
  let start = 0;
  while (true) {
    const pos = result.indexOf("[Called", start);
    if (pos === -1) break;
    callPositions.push(pos);
    start = pos + 1;
  }

  // 从后向前移除，避免位置偏移
  for (let i = callPositions.length - 1; i >= 0; i--) {
    const startPos = callPositions[i];
    const segment = result.substring(startPos);
    const bracketEnd = findMatchingBracket(segment, 0);

    if (bracketEnd !== -1) {
      result = result.substring(0, startPos) + result.substring(startPos + bracketEnd + 1);
    } else {
      const lastBracket = segment.indexOf("]");
      if (lastBracket !== -1) {
        result = result.substring(0, startPos) + result.substring(startPos + lastBracket + 1);
      }
    }
  }

  // 清理多余的空白
  return result.replace(/\n\s*\n/g, '\n').trim();
}

/**
 * 生成 Claude 格式的流式响应
 * 策略：直接流式发送文本，在流结束后检测并解析文本格式的工具调用
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

  // 工具调用收集（来自原生事件）
  const toolCalls: CollectedToolCall[] = [];
  let currentToolCall: CollectedToolCall | null = null;

  // 收集完整的文本内容（用于在流结束后检测文本格式的工具调用）
  let fullTextContent = "";

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
        // 累积文本内容
        fullTextContent += event.content;

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

  // 检测文本内容中的 bracket 格式工具调用
  // 格式: [Called ToolName (tooluse_xxx) with args: {...}]
  let bracketToolCalls: CollectedToolCall[] = [];
  if (fullTextContent.includes("[Called")) {
    bracketToolCalls = parseBracketToolCalls(fullTextContent);
    if (bracketToolCalls.length > 0) {
      console.log("[Claude Converter] Detected bracket-style tool calls in text:",
        bracketToolCalls.map(tc => `${tc.name}(${tc.toolUseId})`).join(', '));
    }
  }

  // 合并原生工具调用和文本格式工具调用
  const allToolCalls = [...toolCalls, ...bracketToolCalls];
  console.log("[Claude Converter] Total tool calls before dedup:", allToolCalls.length);
  console.log("[Claude Converter] Tool call IDs:", allToolCalls.map(tc => tc.toolUseId));

  // 去重
  const uniqueToolCalls = deduplicateToolCalls(allToolCalls);
  console.log("[Claude Converter] Tool calls after dedup:", uniqueToolCalls.length);

  // 在流结束后统一发送所有工具调用事件
  if (uniqueToolCalls.length > 0) {
    console.log("[Claude Converter] Sending tool calls:", uniqueToolCalls.map(tc => tc.name).join(', '));

    const baseIndex = textBlockIndex + (contentStarted ? 1 : 0);
    for (let i = 0; i < uniqueToolCalls.length; i++) {
      const tc = uniqueToolCalls[i];
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
