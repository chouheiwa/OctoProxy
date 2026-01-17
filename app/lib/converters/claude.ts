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
  toolUseId: string;      // 标准化后的 ID（用于输出到 Claude API）
  rawToolUseId?: string;  // 原始 ID（用于事件匹配比较）
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
 * Anthropic API 期望格式: toolu_XXXXXXXXXXXXXXXXXXXXXXXX (toolu_ + 24个字母数字字符)
 * 注意：ID 部分只能包含字母和数字，不能包含连字符或其他特殊字符
 */
function normalizeToolUseId(rawId: string | undefined): string {
  if (!rawId) {
    return generateToolUseId();
  }

  // 提取所有字母数字字符（移除连字符和其他特殊字符）
  let idPart: string;

  if (rawId.startsWith('toolu_')) {
    // 已经是 toolu_ 格式，提取后面的部分并清理
    idPart = rawId.substring('toolu_'.length).replace(/[^a-zA-Z0-9]/g, '');
  } else if (rawId.startsWith('tooluse_')) {
    // tooluse_ 格式，提取后面的部分并清理
    idPart = rawId.substring('tooluse_'.length).replace(/[^a-zA-Z0-9]/g, '');
  } else {
    // 其他格式，提取所有字母数字字符
    idPart = rawId.replace(/[^a-zA-Z0-9]/g, '');
  }

  // 确保 ID 部分正好是 24 个字符
  if (idPart.length >= 24) {
    return `toolu_${idPart.substring(0, 24)}`;
  }

  // ID 部分不够长，补充随机字符
  const padding = uuidv4().replace(/-/g, '').substring(0, 24 - idPart.length);
  return `toolu_${idPart}${padding}`;
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
    console.log("[Claude Converter] Failed to match tool call pattern:");
    console.log("[Claude Converter] Input text (first 200 chars):", toolCallText.substring(0, 200));
    return null;
  }

  const toolName = nameMatch[1].trim();
  const rawToolUseId = nameMatch[2]?.trim();
  // 标准化 tool_use ID 格式
  const toolUseId = normalizeToolUseId(rawToolUseId);
  console.log(`[Claude Converter] Matched tool: ${toolName}, rawId: ${rawToolUseId}, normalizedId: ${toolUseId}`);

  const argsStartMarker = "with args:";
  const argsStartPos = toolCallText
    .toLowerCase()
    .indexOf(argsStartMarker.toLowerCase());
  if (argsStartPos === -1) {
    console.log(`[Claude Converter] Could not find "with args:" marker for ${toolName}`);
    return null;
  }

  const argsStart = argsStartPos + argsStartMarker.length;
  const argsEnd = toolCallText.lastIndexOf("]");
  if (argsEnd <= argsStart) {
    console.log(`[Claude Converter] Invalid bracket positions for ${toolName}: argsStart=${argsStart}, argsEnd=${argsEnd}`);
    return null;
  }

  const jsonCandidate = toolCallText.substring(argsStart, argsEnd).trim();
  console.log(`[Claude Converter] JSON candidate for ${toolName} (first 300 chars):`, jsonCandidate.substring(0, 300));

  // 先尝试直接解析 JSON
  try {
    const argumentsObj = JSON.parse(jsonCandidate);
    if (typeof argumentsObj !== "object" || argumentsObj === null) {
      console.log(`[Claude Converter] Parsed non-object for ${toolName}, wrapping as value`);
      return {
        toolUseId,
        name: toolName,
        input: JSON.stringify({ value: argumentsObj }),
      };
    }

    console.log(`[Claude Converter] Successfully parsed tool call: ${toolName} (${toolUseId})`);
    return {
      toolUseId,
      name: toolName,
      input: JSON.stringify(argumentsObj),
    };
  } catch (firstError: any) {
    // 直接解析失败，尝试修复 JSON（仅用于处理非标准格式）
    console.log(`[Claude Converter] Direct parse failed for ${toolName}, trying repair...`);

    try {
      const repairedJson = repairJson(jsonCandidate);
      const argumentsObj = JSON.parse(repairedJson);
      if (typeof argumentsObj !== "object" || argumentsObj === null) {
        return {
          toolUseId,
          name: toolName,
          input: JSON.stringify({ value: argumentsObj }),
        };
      }

      console.log(`[Claude Converter] Successfully parsed with repair: ${toolName} (${toolUseId})`);
      return {
        toolUseId,
        name: toolName,
        input: JSON.stringify(argumentsObj),
      };
    } catch (e: any) {
      // 修复后仍然失败，打印详细信息
      console.error(`[Claude Converter] JSON parse FAILED for ${toolName}:`);
      console.error(`[Claude Converter]   Error: ${firstError.message}`);
      console.error(`[Claude Converter]   Original JSON: ${jsonCandidate}`);
      console.error(`[Claude Converter]   Full tool call text length: ${toolCallText.length}`);
      // 使用空对象（必须是有效的 JSON）
      return {
        toolUseId,
        name: toolName,
        input: '{}',
      };
    }
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
 * 策略：缓冲模式 - 先收集所有内容，流结束后统一处理并发送
 * 这样可以确保 [Called ...] 格式的文本被正确解析并移除，避免 Claude Code 崩溃
 */
export async function* convertStreamToClaude(
  kiroStream: AsyncGenerator<KiroStreamEvent>,
  model: string
): AsyncGenerator<string> {
  const id = `msg_${uuidv4().replace(/-/g, "").substring(0, 24)}`;
  let usage: Usage | null = null;
  let stopReason = "end_turn";

  // 工具调用收集（来自原生事件）
  const toolCalls: CollectedToolCall[] = [];
  let currentToolCall: CollectedToolCall | null = null;

  // 缓冲所有文本内容（流结束后统一处理）
  let fullTextContent = "";

  // 发送 message_start
  const msgStart = createMessageStart(id, model);
  console.log('[Claude Converter] SSE output:', msgStart.substring(0, 200));
  yield msgStart;

  // 定期发送 ping 保持连接活跃
  let lastPingTime = Date.now();
  const PING_INTERVAL = 5000; // 5秒发送一次 ping

  try {
    for await (const event of kiroStream) {
      // 检查是否需要发送 ping
      const now = Date.now();
      if (now - lastPingTime > PING_INTERVAL) {
        yield createPing();
        lastPingTime = now;
      }

      // Kiro 返回的事件格式: { type: "content", content: "..." }
      if (event.type === "content" && event.content) {
        // 缓冲文本内容（不立即发送）
        fullTextContent += event.content;
      } else if (event.type === "toolUse" && (event as any).toolUse) {
        // 工具调用事件 - 收集但不立即发送
        const toolData = (event as any).toolUse;

        if (toolData.name && toolData.toolUseId) {
          // 检查是否是同一个工具调用的续传
          // 重要：使用原始 ID 进行比较，因为标准化会改变 ID 格式
          if (currentToolCall && currentToolCall.rawToolUseId === toolData.toolUseId) {
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
              toolUseId: normalizeToolUseId(toolData.toolUseId),
              rawToolUseId: toolData.toolUseId,  // 保存原始 ID 用于后续比较
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
    // 如果是上下文超限错误，重新抛出让外层处理
    if (error.name === "ContextLimitExceededError") {
      throw error;
    }
    console.error(`[Claude Converter] Stream error:`, error.message);
    stopReason = "error";
  }

  // 处理未完成的工具调用（如果流提前结束）
  if (currentToolCall) {
    toolCalls.push(currentToolCall);
    currentToolCall = null;
  }

  // 检测文本内容中的 bracket 格式工具调用
  // 格式: [Called ToolName (tooluse_xxx) with args: {...}]
  let bracketToolCalls: CollectedToolCall[] = [];
  if (fullTextContent.includes("[Called")) {
    bracketToolCalls = parseBracketToolCalls(fullTextContent);
  }

  // 合并原生工具调用和文本格式工具调用，并去重
  const allToolCalls = [...toolCalls, ...bracketToolCalls];
  const uniqueToolCalls = deduplicateToolCalls(allToolCalls);

  // 如果有工具调用，从文本中移除工具调用文本
  let cleanedText = fullTextContent;
  if (uniqueToolCalls.length > 0 && fullTextContent.includes("[Called")) {
    cleanedText = removeToolCallsFromText(fullTextContent);
  }

  console.log(`[Claude Converter] Stream finished. fullTextContent length: ${fullTextContent.length}, cleanedText length: ${cleanedText.length}, toolCalls: ${uniqueToolCalls.length}`);
  console.log(`[Claude Converter] Full text content:`, fullTextContent.substring(0, 500));

  // 发送清理后的文本内容（如果有）
  let textBlockIndex = 0;
  if (cleanedText.trim()) {
    const blockStart = createContentBlockStart(textBlockIndex);
    const blockDelta = createContentBlockDelta(textBlockIndex, cleanedText);
    const blockStop = createContentBlockStop(textBlockIndex);

    console.log('[Claude Converter] SSE text block start:', blockStart.substring(0, 200));
    console.log('[Claude Converter] SSE text block delta:', blockDelta.substring(0, 300));
    console.log('[Claude Converter] SSE text block stop:', blockStop);

    yield blockStart;
    yield blockDelta;
    yield blockStop;
    textBlockIndex++;
  }

  // 发送所有工具调用事件
  if (uniqueToolCalls.length > 0) {
    console.log(`[Claude Converter] Processing ${uniqueToolCalls.length} tool calls`);

    for (let i = 0; i < uniqueToolCalls.length; i++) {
      const tc = uniqueToolCalls[i];
      const blockIndex = textBlockIndex + i;

      console.log(`[Claude Converter] Tool call ${i}: name=${tc.name}, id=${tc.toolUseId}, input length=${tc.input?.length || 0}`);

      // 解析 input 为对象（如果是字符串的话）
      // 注意：input_json_delta 必须是有效的 JSON 字符串
      let inputJson: string;
      if (typeof tc.input === 'string') {
        try {
          // 尝试解析并重新序列化，确保格式正确
          const parsed = JSON.parse(tc.input);
          inputJson = JSON.stringify(parsed);
        } catch {
          // 如果解析失败，必须使用空对象（不能使用无效的 JSON 字符串）
          console.error(`[Claude Converter] INVALID JSON for ${tc.name}, using empty object. Raw input:`, tc.input?.substring(0, 300));
          inputJson = '{}';
        }
      } else {
        inputJson = JSON.stringify(tc.input || {});
      }

      // 发送 content_block_start
      const toolStart = createToolUseBlockStart(blockIndex, tc.toolUseId, tc.name);
      // 发送完整的 input_json_delta
      const toolDelta = createToolUseInputDelta(blockIndex, inputJson);
      // 发送 content_block_stop
      const toolStop = createContentBlockStop(blockIndex);

      console.log('[Claude Converter] SSE tool start:', toolStart);
      console.log('[Claude Converter] SSE tool delta:', toolDelta.substring(0, 300));
      console.log('[Claude Converter] SSE tool stop:', toolStop);

      yield toolStart;
      yield toolDelta;
      yield toolStop;
    }

    stopReason = "tool_use";
  }

  // 发送 message_delta 和 message_stop
  const msgDelta = createMessageDelta(stopReason, usage);
  const msgStop = createMessageStop();

  console.log('[Claude Converter] SSE message_delta:', msgDelta);
  console.log('[Claude Converter] SSE message_stop:', msgStop);

  yield msgDelta;
  yield msgStop;
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
