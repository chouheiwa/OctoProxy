/**
 * API 路由
 * 处理 /v1/* 代理请求
 */

import { authenticateApiKey } from "../middleware/auth.js";
import { incrementApiKeyUsage } from "../db/api-keys.js";
import { executeWithRetry, executeStream } from "../pool/manager.js";
import { KIRO_MODELS } from "../kiro/constants.js";
import { getConfig } from "../config.js";
import * as openaiConverter from "../converters/openai.js";
import * as claudeConverter from "../converters/claude.js";

/**
 * 调试日志
 */
function debug(...args) {
  if (getConfig().debug) {
    console.log(...args);
  }
}

/**
 * 解析请求体
 * @param {Object} req 请求对象
 * @returns {Promise<Object>}
 */
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * 发送 JSON 响应
 * @param {Object} res 响应对象
 * @param {number} status 状态码
 * @param {Object} data 数据
 */
function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

/**
 * 发送 SSE 响应头
 * @param {Object} res 响应对象
 */
function sendSSEHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
}

/**
 * 处理 GET /v1/models
 */
async function handleModels(req, res) {
  const auth = authenticateApiKey(req, res);
  if (!auth.success) {
    return sendJson(
      res,
      401,
      openaiConverter.createErrorResponse(auth.error, "authentication_error"),
    );
  }

  const response = openaiConverter.createModelsResponse(KIRO_MODELS);
  sendJson(res, 200, response);
}

/**
 * 处理 POST /v1/chat/completions (OpenAI 格式)
 */
async function handleChatCompletions(req, res) {
  const auth = authenticateApiKey(req, res);
  if (!auth.success) {
    return sendJson(
      res,
      401,
      openaiConverter.createErrorResponse(auth.error, "authentication_error"),
    );
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendJson(res, 400, openaiConverter.createErrorResponse(e.message));
  }

  const { model, messages, stream = false, max_tokens, temperature } = body;

  if (!model) {
    return sendJson(
      res,
      400,
      openaiConverter.createErrorResponse("model is required"),
    );
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return sendJson(
      res,
      400,
      openaiConverter.createErrorResponse(
        "messages is required and must be a non-empty array",
      ),
    );
  }

  // 检查模型是否支持
  if (!KIRO_MODELS.includes(model)) {
    return sendJson(
      res,
      400,
      openaiConverter.createErrorResponse(
        `Model ${model} is not supported. Supported models: ${KIRO_MODELS.join(", ")}`,
      ),
    );
  }

  // 转换消息格式
  const kiroMessages = openaiConverter.convertMessagesToKiro(messages);

  // 构建选项
  const options = {};
  if (max_tokens) options.max_tokens = max_tokens;
  if (temperature !== undefined) options.temperature = temperature;

  // 增加 API Key 使用量
  incrementApiKeyUsage(auth.apiKey.id);

  // 构建请求体
  const requestBody = {
    messages: kiroMessages,
    ...options,
  };

  if (stream) {
    // 流式响应
    sendSSEHeaders(res);

    try {
      const streamGenerator = executeStream((service, provider) => {
        return service.streamApi(model, requestBody);
      });

      for await (const chunk of openaiConverter.convertStreamToOpenAI(
        streamGenerator,
        model,
      )) {
        res.write(chunk);
      }
    } catch (error) {
      console.error("[API] Stream error:", error.message);
      res.write(
        openaiConverter.formatSSE({
          error: { message: error.message, type: "server_error" },
        }),
      );
      res.write("data: [DONE]\n\n");
    }

    res.end();
  } else {
    // 非流式响应
    try {
      const result = await executeWithRetry(async (service, provider) => {
        return service.callApi(model, requestBody);
      });

      const response = openaiConverter.convertResponseToOpenAI(result, model);
      sendJson(res, 200, response);
    } catch (error) {
      console.error("[API] Request error:", error.message);
      sendJson(
        res,
        500,
        openaiConverter.createErrorResponse(error.message, "server_error"),
      );
    }
  }
}

/**
 * 处理 POST /v1/messages (Claude 格式)
 */
async function handleMessages(req, res) {
  debug("[API] handleMessages called");

  const auth = authenticateApiKey(req, res);
  if (!auth.success) {
    debug("[API] Auth failed:", auth.error);
    return sendJson(
      res,
      401,
      claudeConverter.createErrorResponse(auth.error, "authentication_error"),
    );
  }

  let body;
  try {
    body = await parseBody(req);
    debug(
      "[API] Request body parsed, model:",
      body.model,
      "stream:",
      body.stream,
      "messages count:",
      body.messages?.length,
    );
  } catch (e) {
    debug("[API] Body parse error:", e.message);
    return sendJson(res, 400, claudeConverter.createErrorResponse(e.message));
  }

  const {
    model,
    messages,
    system,
    stream = false,
    max_tokens,
    temperature,
  } = body;

  if (!model) {
    return sendJson(
      res,
      400,
      claudeConverter.createErrorResponse("model is required"),
    );
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return sendJson(
      res,
      400,
      claudeConverter.createErrorResponse(
        "messages is required and must be a non-empty array",
      ),
    );
  }

  if (!max_tokens) {
    return sendJson(
      res,
      400,
      claudeConverter.createErrorResponse("max_tokens is required"),
    );
  }

  // 检查模型是否支持
  if (!KIRO_MODELS.includes(model)) {
    return sendJson(
      res,
      400,
      claudeConverter.createErrorResponse(`Model ${model} is not supported`),
    );
  }

  // 转换消息格式
  const kiroMessages = claudeConverter.convertMessagesToKiro(messages, system);

  // 构建选项
  const options = { max_tokens };
  if (temperature !== undefined) options.temperature = temperature;

  // 增加 API Key 使用量
  incrementApiKeyUsage(auth.apiKey.id);

  // 构建请求体
  const requestBody = {
    messages: kiroMessages,
    system,
    ...options,
  };

  if (stream) {
    // 流式响应
    debug("[API] Starting stream response");
    sendSSEHeaders(res);

    try {
      const streamGenerator = executeStream((service, provider) => {
        debug("[API] Calling streamApi with provider:", provider.id);
        return service.streamApi(model, requestBody);
      });

      let chunkCount = 0;
      for await (const chunk of claudeConverter.convertStreamToClaude(
        streamGenerator,
        model,
      )) {
        chunkCount++;
        res.write(chunk);
      }
      debug("[API] Stream completed, total chunks:", chunkCount);
    } catch (error) {
      console.error("[API] Stream error:", error.message, error.stack);
      res.write(
        claudeConverter.createStreamEvent("error", {
          type: "error",
          error: { type: "server_error", message: error.message },
        }),
      );
    }

    res.end();
    debug("[API] Response ended");
  } else {
    // 非流式响应
    try {
      const result = await executeWithRetry(async (service, provider) => {
        return service.callApi(model, requestBody);
      });

      const response = claudeConverter.convertResponseToClaude(result, model);
      sendJson(res, 200, response);
    } catch (error) {
      console.error("[API] Request error:", error.message);
      sendJson(
        res,
        500,
        claudeConverter.createErrorResponse(error.message, "server_error"),
      );
    }
  }
}

/**
 * 处理健康检查
 */
async function handleHealth(req, res) {
  sendJson(res, 200, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}

/**
 * API 路由处理器
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 * @returns {boolean} 是否处理了请求
 */
export async function handleApiRoutes(req, res) {
  const { method, url } = req;
  const path = url.split("?")[0];

  // CORS 预检请求
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return true;
  }

  // 路由匹配
  if (path === "/v1/models" && method === "GET") {
    await handleModels(req, res);
    return true;
  }

  if (path === "/v1/chat/completions" && method === "POST") {
    await handleChatCompletions(req, res);
    return true;
  }

  if (path === "/v1/messages" && method === "POST") {
    await handleMessages(req, res);
    return true;
  }

  if (path === "/health" && method === "GET") {
    await handleHealth(req, res);
    return true;
  }

  return false;
}

export default {
  handleApiRoutes,
};
