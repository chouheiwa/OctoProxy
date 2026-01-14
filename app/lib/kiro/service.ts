import axios, { AxiosInstance, AxiosResponse } from "axios";
import { v4 as uuidv4 } from "uuid";
import * as crypto from "crypto";
import * as http from "http";
import * as https from "https";
import * as os from "os";
import {
  KIRO_CONSTANTS,
  MODEL_MAPPING,
  KIRO_MODELS,
  CLAUDE_DEFAULT_MAX_TOKENS,
} from "./constants";

/**
 * Kiro 凭据接口
 */
export interface KiroCredentials {
  uuid?: string;
  accessToken: string;
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  authMethod?: string;
  expiresAt?: string;
  profileArn?: string;
  region?: string;
}

/**
 * Kiro 配置接口
 */
export interface KiroConfig {
  requestMaxRetries?: number;
  requestBaseDelay?: number;
}

/**
 * 消息内容接口
 */
export interface MessageContent {
  type: string;
  text?: string;
}

/**
 * 消息接口
 */
export interface Message {
  role: string;
  content: string | MessageContent[];
}

/**
 * 工具接口
 */
export interface Tool {
  name: string;
  description?: string;
  input_schema?: any;
}

/**
 * 请求体接口
 */
export interface RequestBody {
  messages: Message[];
  tools?: Tool[];
  system?: string;
  max_tokens?: number;
}

/**
 * 工具调用接口
 */
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 流式事件接口
 */
export interface StreamEvent {
  type: string;
  content?: string;
  toolUse?: any;
  input?: string;
  stop?: boolean;
  percentage?: number;
}

/**
 * 用量接口
 */
export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

/**
 * 刷新响应接口
 */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  profileArn?: string;
  expiresAt: string;
}

/**
 * 模型信息接口
 */
export interface ModelInfo {
  id: string;
  name: string;
}

/**
 * 根据配置生成唯一的机器码
 */
function generateMachineIdFromConfig(credentials: KiroCredentials): string {
  const uniqueKey =
    credentials.uuid ||
    credentials.profileArn ||
    credentials.clientId ||
    "KIRO_DEFAULT_MACHINE";
  return crypto.createHash("sha256").update(uniqueKey).digest("hex");
}

/**
 * 获取系统运行时信息
 */
function getSystemRuntimeInfo(): { osName: string; nodeVersion: string } {
  const osPlatform = os.platform();
  const osRelease = os.release();
  const nodeVersion = process.version.replace("v", "");

  let osName: string = osPlatform;
  if (osPlatform === "win32") osName = `windows#${osRelease}`;
  else if (osPlatform === "darwin") osName = `macos#${osRelease}`;
  else osName = `${osPlatform}#${osRelease}`;

  return { osName, nodeVersion };
}

/**
 * 检查是否为可重试的网络错误
 */
function isRetryableNetworkError(error: any): boolean {
  const retryableCodes = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EPIPE",
    "ENOTFOUND",
    "ENETUNREACH",
    "EAI_AGAIN",
  ];
  return (
    retryableCodes.includes(error.code) ||
    error.message?.includes("socket hang up")
  );
}

/**
 * 括号匹配函数
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
 * 解析单个工具调用
 */
function parseSingleToolCall(toolCallText: string): ToolCall | null {
  const namePattern = /\[Called\s+(\w+)\s+with\s+args:/i;
  const nameMatch = toolCallText.match(namePattern);
  if (!nameMatch) return null;

  const functionName = nameMatch[1].trim();
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
    if (typeof argumentsObj !== "object" || argumentsObj === null) return null;

    return {
      id: `call_${uuidv4().replace(/-/g, "").substring(0, 8)}`,
      type: "function",
      function: { name: functionName, arguments: JSON.stringify(argumentsObj) },
    };
  } catch (e) {
    return null;
  }
}

/**
 * 解析 bracket 格式的工具调用
 */
function parseBracketToolCalls(responseText: string): ToolCall[] | null {
  if (!responseText || !responseText.includes("[Called")) return null;

  const toolCalls: ToolCall[] = [];
  const callPositions: number[] = [];
  let start = 0;
  while (true) {
    const pos = responseText.indexOf("[Called", start);
    if (pos === -1) break;
    callPositions.push(pos);
    start = pos + 1;
  }

  for (let i = 0; i < callPositions.length; i++) {
    const startPos = callPositions[i];
    const endSearchLimit =
      i + 1 < callPositions.length ? callPositions[i + 1] : responseText.length;
    const segment = responseText.substring(startPos, endSearchLimit);
    const bracketEnd = findMatchingBracket(segment, 0);

    let toolCallText: string;
    if (bracketEnd !== -1) {
      toolCallText = segment.substring(0, bracketEnd + 1);
    } else {
      const lastBracket = segment.lastIndexOf("]");
      if (lastBracket !== -1) toolCallText = segment.substring(0, lastBracket + 1);
      else continue;
    }

    const parsedCall = parseSingleToolCall(toolCallText);
    if (parsedCall) toolCalls.push(parsedCall);
  }
  return toolCalls.length > 0 ? toolCalls : null;
}

/**
 * 去重工具调用
 */
function deduplicateToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  const uniqueToolCalls: ToolCall[] = [];
  for (const tc of toolCalls) {
    const key = `${tc.function.name}-${tc.function.arguments}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueToolCalls.push(tc);
    }
  }
  return uniqueToolCalls;
}

/**
 * Kiro API 服务类
 */
export class KiroService {
  private isInitialized: boolean = false;
  private config: KiroConfig;
  private credentials: KiroCredentials;
  private uuid?: string;

  public accessToken: string;
  public refreshToken: string;
  public clientId?: string;
  public clientSecret?: string;
  public authMethod: string;
  public expiresAt?: string;
  public profileArn?: string;
  public region: string;

  private refreshUrl: string;
  private refreshIDCUrl: string;
  private baseUrl: string;
  private amazonQUrl: string;

  private axiosInstance: AxiosInstance | null = null;
  private axiosSocialRefreshInstance: AxiosInstance | null = null;

  constructor(credentials: KiroCredentials, config: KiroConfig = {}) {
    this.config = config;
    this.credentials = credentials;
    this.uuid = credentials.uuid;

    // 从凭据中提取认证信息
    this.accessToken = credentials.accessToken;
    this.refreshToken = credentials.refreshToken;
    this.clientId = credentials.clientId;
    this.clientSecret = credentials.clientSecret;
    this.authMethod =
      credentials.authMethod || KIRO_CONSTANTS.AUTH_METHOD_SOCIAL;
    this.expiresAt = credentials.expiresAt;
    this.profileArn = credentials.profileArn;
    this.region = credentials.region || "us-east-1";

    // 设置 URL
    this.refreshUrl = KIRO_CONSTANTS.REFRESH_URL.replace(
      "{{region}}",
      this.region,
    );
    this.refreshIDCUrl = KIRO_CONSTANTS.REFRESH_IDC_URL.replace(
      "{{region}}",
      this.region,
    );
    this.baseUrl = KIRO_CONSTANTS.BASE_URL.replace("{{region}}", this.region);
    this.amazonQUrl = KIRO_CONSTANTS.AMAZON_Q_URL.replace(
      "{{region}}",
      this.region,
    );
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const machineId = generateMachineIdFromConfig(this.credentials);
    const kiroVersion = KIRO_CONSTANTS.KIRO_VERSION;
    const { osName, nodeVersion } = getSystemRuntimeInfo();

    const httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 100,
      maxFreeSockets: 5,
      timeout: KIRO_CONSTANTS.AXIOS_TIMEOUT,
    });
    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 100,
      maxFreeSockets: 5,
      timeout: KIRO_CONSTANTS.AXIOS_TIMEOUT,
    });

    const axiosConfig = {
      timeout: KIRO_CONSTANTS.AXIOS_TIMEOUT,
      httpAgent,
      httpsAgent,
      headers: {
        "Content-Type": KIRO_CONSTANTS.CONTENT_TYPE_JSON,
        Accept: KIRO_CONSTANTS.ACCEPT_JSON,
        "amz-sdk-request": "attempt=1; max=1",
        "x-amzn-kiro-agent-mode": "vibe",
        "x-amz-user-agent": `aws-sdk-js/1.0.0 KiroIDE-${kiroVersion}-${machineId}`,
        "user-agent": `aws-sdk-js/1.0.0 ua/2.1 os/${osName} lang/js md/nodejs#${nodeVersion} api/codewhispererruntime#1.0.0 m/E KiroIDE-${kiroVersion}-${machineId}`,
        Connection: "close",
      },
    };

    this.axiosInstance = axios.create(axiosConfig);

    const refreshConfig = {
      ...axiosConfig,
      headers: {
        "Content-Type": KIRO_CONSTANTS.CONTENT_TYPE_JSON,
      },
    };
    this.axiosSocialRefreshInstance = axios.create(refreshConfig);

    this.isInitialized = true;
    console.log(`[Kiro] Service initialized for ${this.uuid || "default"}`);
  }

  /**
   * 检查 Token 是否即将过期
   */
  public isExpiryDateNear(nearMinutes: number = 10): boolean {
    try {
      if (!this.expiresAt) return true;
      const expirationTime = new Date(this.expiresAt);
      const thresholdTime = new Date(Date.now() + nearMinutes * 60 * 1000);
      return expirationTime.getTime() <= thresholdTime.getTime();
    } catch (error) {
      return true;
    }
  }

  /**
   * 刷新 Access Token
   */
  public async refreshAccessToken(): Promise<RefreshResponse> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    const requestBody: any = { refreshToken: this.refreshToken };
    let refreshUrl = this.refreshUrl;

    if (this.authMethod !== KIRO_CONSTANTS.AUTH_METHOD_SOCIAL) {
      refreshUrl = this.refreshIDCUrl;
      requestBody.clientId = this.clientId;
      requestBody.clientSecret = this.clientSecret;
      requestBody.grantType = "refresh_token";
    }

    try {
      const response = await this.axiosSocialRefreshInstance!.post(
        refreshUrl,
        requestBody,
      );

      if (response.data && response.data.accessToken) {
        this.accessToken = response.data.accessToken;
        this.refreshToken = response.data.refreshToken;
        this.profileArn = response.data.profileArn || this.profileArn;
        const expiresIn = response.data.expiresIn;
        this.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        console.log("[Kiro] Access token refreshed successfully");

        // 返回更新后的凭据，供外部持久化
        return {
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          profileArn: this.profileArn,
          expiresAt: this.expiresAt,
        };
      } else {
        throw new Error("Invalid refresh response");
      }
    } catch (error: any) {
      console.error("[Kiro] Token refresh failed:", error.message);
      throw error;
    }
  }

  /**
   * 获取文本内容
   */
  public getContentText(message: any): string {
    if (message == null) return "";
    if (Array.isArray(message)) {
      return message
        .filter((part: any) => part.type === "text" && part.text)
        .map((part: any) => part.text)
        .join("");
    } else if (typeof message.content === "string") {
      return message.content;
    } else if (Array.isArray(message.content)) {
      return message.content
        .filter((part: any) => part.type === "text" && part.text)
        .map((part: any) => part.text)
        .join("");
    }
    return String(message.content || message);
  }

  /**
   * 构建 CodeWhisperer 请求
   */
  public buildCodewhispererRequest(
    messages: Message[],
    model: string,
    tools: Tool[] | null = null,
    systemPrompt: string | null = null,
  ): any {
    const conversationId = uuidv4();
    const codewhispererModel =
      MODEL_MAPPING[model] || MODEL_MAPPING[KIRO_CONSTANTS.DEFAULT_MODEL_NAME];

    // 合并相邻相同 role 的消息
    const mergedMessages: Message[] = [];
    for (const msg of messages) {
      if (mergedMessages.length === 0) {
        mergedMessages.push({ ...msg });
      } else {
        const lastMsg = mergedMessages[mergedMessages.length - 1];
        if (msg.role === lastMsg.role) {
          // 合并内容
          if (Array.isArray(lastMsg.content) && Array.isArray(msg.content)) {
            (lastMsg.content as MessageContent[]).push(...(msg.content as MessageContent[]));
          } else if (
            typeof lastMsg.content === "string" &&
            typeof msg.content === "string"
          ) {
            lastMsg.content += "\n" + msg.content;
          } else {
            mergedMessages.push({ ...msg });
          }
        } else {
          mergedMessages.push({ ...msg });
        }
      }
    }

    // 构建工具上下文
    let toolsContext: any = {};
    if (tools && Array.isArray(tools) && tools.length > 0) {
      toolsContext = {
        tools: tools.map((tool) => ({
          toolSpecification: {
            name: tool.name,
            description: tool.description || "",
            inputSchema: { json: tool.input_schema || {} },
          },
        })),
      };
    }

    // 构建历史记录
    const history: any[] = [];
    let startIndex = 0;

    // 处理系统提示
    if (systemPrompt) {
      if (mergedMessages[0]?.role === "user") {
        const firstUserContent = this.getContentText(mergedMessages[0]);
        history.push({
          userInputMessage: {
            content: `${systemPrompt}\n\n${firstUserContent}`,
            modelId: codewhispererModel,
            origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR,
          },
        });
        startIndex = 1;
      } else {
        history.push({
          userInputMessage: {
            content: systemPrompt,
            modelId: codewhispererModel,
            origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR,
          },
        });
      }
    }

    // 处理历史消息
    for (let i = startIndex; i < mergedMessages.length - 1; i++) {
      const message = mergedMessages[i];
      if (message.role === "user") {
        const userInputMessage = {
          content: this.getContentText(message),
          modelId: codewhispererModel,
          origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR,
        };
        history.push({ userInputMessage });
      } else if (message.role === "assistant") {
        const assistantResponseMessage = {
          content: this.getContentText(message),
        };
        history.push({ assistantResponseMessage });
      }
    }

    // 处理当前消息
    let currentMessage = mergedMessages[mergedMessages.length - 1];
    let currentContent = this.getContentText(currentMessage);

    if (currentMessage.role === "assistant") {
      history.push({ assistantResponseMessage: { content: currentContent } });
      currentContent = "Continue";
    } else {
      if (
        history.length > 0 &&
        !history[history.length - 1].assistantResponseMessage
      ) {
        history.push({ assistantResponseMessage: { content: "Continue" } });
      }
    }

    if (!currentContent) currentContent = "Continue";

    const request: any = {
      conversationState: {
        chatTriggerType: KIRO_CONSTANTS.CHAT_TRIGGER_TYPE_MANUAL,
        conversationId: conversationId,
        currentMessage: {
          userInputMessage: {
            content: currentContent,
            modelId: codewhispererModel,
            origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR,
          },
        },
      },
    };

    if (history.length > 0) {
      request.conversationState.history = history;
    }

    if (Object.keys(toolsContext).length > 0) {
      request.conversationState.currentMessage.userInputMessage.userInputMessageContext =
        toolsContext;
    }

    if (this.authMethod === KIRO_CONSTANTS.AUTH_METHOD_SOCIAL) {
      request.profileArn = this.profileArn;
    }

    return request;
  }

  /**
   * 调用 API
   */
  public async callApi(
    model: string,
    body: RequestBody,
    isRetry: boolean = false,
    retryCount: number = 0
  ): Promise<AxiosResponse<any>> {
    if (!this.isInitialized) await this.initialize();

    const maxRetries = this.config.requestMaxRetries || 3;
    const baseDelay = this.config.requestBaseDelay || 1000;

    // 检查 Token 是否需要刷新
    if (this.isExpiryDateNear()) {
      await this.refreshAccessToken();
    }

    const requestData = this.buildCodewhispererRequest(
      body.messages,
      model,
      body.tools || null,
      body.system || null,
    );

    try {
      const headers = {
        Authorization: `Bearer ${this.accessToken}`,
        "amz-sdk-invocation-id": uuidv4(),
      };

      const requestUrl = model.startsWith("amazonq")
        ? this.amazonQUrl
        : this.baseUrl;
      const response = await this.axiosInstance!.post(requestUrl, requestData, {
        headers,
      });
      return response;
    } catch (error: any) {
      const status = error.response?.status;

      if (status === 403 && !isRetry) {
        console.log("[Kiro] Received 403, refreshing token...");
        await this.refreshAccessToken();
        return this.callApi(model, body, true, retryCount);
      }

      if (
        (status === 429 ||
          (status >= 500 && status < 600) ||
          isRetryableNetworkError(error)) &&
        retryCount < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(
          `[Kiro] Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callApi(model, body, isRetry, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * 解析 AWS Event Stream
   */
  public parseAwsEventStreamBuffer(buffer: string): {
    events: any[];
    remaining: string;
  } {
    const events: any[] = [];
    let remaining = buffer;
    let searchStart = 0;

    while (true) {
      const contentStart = remaining.indexOf('{"content":', searchStart);
      const nameStart = remaining.indexOf('{"name":', searchStart);
      const inputStart = remaining.indexOf('{"input":', searchStart);
      const stopStart = remaining.indexOf('{"stop":', searchStart);
      const contextUsageStart = remaining.indexOf(
        '{"contextUsagePercentage":',
        searchStart,
      );

      const candidates = [
        contentStart,
        nameStart,
        inputStart,
        stopStart,
        contextUsageStart,
      ].filter((pos) => pos >= 0);
      if (candidates.length === 0) break;

      const jsonStart = Math.min(...candidates);
      if (jsonStart < 0) break;

      // 使用括号计数法找到完整 JSON
      let braceCount = 0;
      let jsonEnd = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = jsonStart; i < remaining.length; i++) {
        const char = remaining[i];
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === "\\") {
          escapeNext = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") braceCount++;
          else if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i;
              break;
            }
          }
        }
      }

      if (jsonEnd < 0) {
        remaining = remaining.substring(jsonStart);
        break;
      }

      const jsonStr = remaining.substring(jsonStart, jsonEnd + 1);
      try {
        const parsed = JSON.parse(jsonStr);
        // 调试日志：打印解析的 JSON（非 content 类型）
        if (parsed.content === undefined) {
          console.log("[Kiro] Parsed non-content event:", jsonStr.substring(0, 200));
        }
        if (parsed.content !== undefined && !parsed.followupPrompt) {
          events.push({ type: "content", data: parsed.content });
        } else if (parsed.name && parsed.toolUseId) {
          events.push({
            type: "toolUse",
            data: {
              name: parsed.name,
              toolUseId: parsed.toolUseId,
              input: parsed.input || "",
              stop: parsed.stop || false,
            },
          });
        } else if (parsed.input !== undefined && !parsed.name) {
          events.push({ type: "toolUseInput", data: { input: parsed.input } });
        } else if (parsed.stop !== undefined) {
          events.push({ type: "toolUseStop", data: { stop: parsed.stop } });
        } else if (parsed.contextUsagePercentage !== undefined) {
          events.push({
            type: "contextUsage",
            data: { percentage: parsed.contextUsagePercentage },
          });
        }
      } catch (e) {}

      searchStart = jsonEnd + 1;
      if (searchStart >= remaining.length) {
        remaining = "";
        break;
      }
    }

    if (searchStart > 0 && remaining.length > 0) {
      remaining = remaining.substring(searchStart);
    }

    return { events, remaining };
  }

  /**
   * 流式 API 调用
   */
  public async *streamApi(
    model: string,
    body: RequestBody,
    isRetry: boolean = false,
    retryCount: number = 0
  ): AsyncGenerator<StreamEvent> {
    if (!this.isInitialized) await this.initialize();

    const maxRetries = this.config.requestMaxRetries || 3;
    const baseDelay = this.config.requestBaseDelay || 1000;

    if (this.isExpiryDateNear()) {
      await this.refreshAccessToken();
    }

    const requestData = this.buildCodewhispererRequest(
      body.messages,
      model,
      body.tools || null,
      body.system || null,
    );
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      "amz-sdk-invocation-id": uuidv4(),
    };

    const requestUrl = model.startsWith("amazonq")
      ? this.amazonQUrl
      : this.baseUrl;
    let stream: any = null;

    try {
      const response = await this.axiosInstance!.post(requestUrl, requestData, {
        headers,
        responseType: "stream",
      });

      stream = response.data;
      let buffer = "";
      let lastContentEvent: string | null = null;

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const { events, remaining } = this.parseAwsEventStreamBuffer(buffer);
        buffer = remaining;

        for (const event of events) {
          if (event.type === "content" && event.data) {
            if (lastContentEvent === event.data) continue;
            lastContentEvent = event.data;
            yield { type: "content", content: event.data };
          } else if (event.type === "toolUse") {
            yield { type: "toolUse", toolUse: event.data };
          } else if (event.type === "toolUseInput") {
            yield { type: "toolUseInput", input: event.data.input };
          } else if (event.type === "toolUseStop") {
            yield { type: "toolUseStop", stop: event.data.stop };
          } else if (event.type === "contextUsage") {
            yield { type: "contextUsage", percentage: event.data.percentage };
          }
        }
      }
    } catch (error: any) {
      if (stream && typeof stream.destroy === "function") stream.destroy();

      const status = error.response?.status;

      if (status === 403 && !isRetry) {
        await this.refreshAccessToken();
        yield* this.streamApi(model, body, true, retryCount);
        return;
      }

      if (
        (status === 429 ||
          (status >= 500 && status < 600) ||
          isRetryableNetworkError(error)) &&
        retryCount < maxRetries
      ) {
        const delay = baseDelay * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        yield* this.streamApi(model, body, isRetry, retryCount + 1);
        return;
      }

      throw error;
    } finally {
      if (stream && typeof stream.destroy === "function") stream.destroy();
    }
  }

  /**
   * 估算输入 Token 数
   */
  public estimateInputTokens(requestBody: RequestBody): number {
    let totalTokens = 0;
    if (requestBody.system) {
      totalTokens += Math.ceil(
        this.getContentText(requestBody.system).length / 4,
      );
    }
    if (requestBody.messages) {
      for (const msg of requestBody.messages) {
        totalTokens += Math.ceil(this.getContentText(msg).length / 4);
      }
    }
    if (requestBody.tools) {
      totalTokens += Math.ceil(JSON.stringify(requestBody.tools).length / 4);
    }
    return totalTokens;
  }

  /**
   * 从百分比计算输入 Token 数
   */
  public calculateInputTokensFromPercentage(percentage: number): number {
    if (!percentage || percentage <= 0) return 0;
    return Math.round((percentage / 100) * CLAUDE_DEFAULT_MAX_TOKENS);
  }

  /**
   * 获取支持的模型列表
   */
  public static getModels(): ModelInfo[] {
    return KIRO_MODELS.map((id) => ({ id, name: id }));
  }

  /**
   * 获取用量限制信息
   */
  public async getUsageLimits(): Promise<any> {
    if (!this.isInitialized) await this.initialize();

    // 检查 token 是否即将过期，如果是则先刷新
    if (this.isExpiryDateNear()) {
      console.log(
        "[Kiro] Token is near expiry, refreshing before getUsageLimits request...",
      );
      await this.refreshAccessToken();
    }

    // 内部固定的资源类型
    const resourceType = "AGENTIC_REQUEST";

    // 构建请求 URL
    const usageLimitsUrl = KIRO_CONSTANTS.USAGE_LIMITS_URL.replace(
      "{{region}}",
      this.region,
    );
    const params = new URLSearchParams({
      isEmailRequired: "true",
      origin: KIRO_CONSTANTS.ORIGIN_AI_EDITOR,
      resourceType: resourceType,
    });
    if (
      this.authMethod === KIRO_CONSTANTS.AUTH_METHOD_SOCIAL &&
      this.profileArn
    ) {
      params.append("profileArn", this.profileArn);
    }
    const fullUrl = `${usageLimitsUrl}?${params.toString()}`;

    // 构建请求头
    const machineId = generateMachineIdFromConfig(this.credentials);
    const kiroVersion = KIRO_CONSTANTS.KIRO_VERSION;
    const { osName, nodeVersion } = getSystemRuntimeInfo();

    const headers: any = {
      Authorization: `Bearer ${this.accessToken}`,
      "x-amz-user-agent": `aws-sdk-js/1.0.0 KiroIDE-${kiroVersion}-${machineId}`,
      "user-agent": `aws-sdk-js/1.0.0 ua/2.1 os/${osName} lang/js md/nodejs#${nodeVersion} api/codewhispererruntime#1.0.0 m/E KiroIDE-${kiroVersion}-${machineId}`,
      "amz-sdk-invocation-id": uuidv4(),
      "amz-sdk-request": "attempt=1; max=1",
      Connection: "close",
    };

    try {
      const response = await this.axiosInstance!.get(fullUrl, { headers });
      console.log("[Kiro] Usage limits fetched successfully");
      return response.data;
    } catch (error: any) {
      // 如果是 403 错误，尝试刷新 token 后重试
      if (error.response?.status === 403) {
        console.log(
          "[Kiro] Received 403 on getUsageLimits. Attempting token refresh and retrying...",
        );
        try {
          await this.refreshAccessToken();
          // 更新 Authorization header
          headers["Authorization"] = `Bearer ${this.accessToken}`;
          headers["amz-sdk-invocation-id"] = uuidv4();
          const retryResponse = await this.axiosInstance!.get(fullUrl, {
            headers,
          });
          console.log(
            "[Kiro] Usage limits fetched successfully after token refresh",
          );
          return retryResponse.data;
        } catch (refreshError: any) {
          console.error(
            "[Kiro] Token refresh failed or getUsageLimits retry:",
            refreshError.message,
          );
          throw refreshError;
        }
      }
      console.error("[Kiro] Failed to fetch usage limits:", error.message);
      throw error;
    }
  }
}

export default KiroService;
