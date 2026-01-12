/**
 * 管理 API 路由
 * 处理 /api/* 管理请求
 */

import { authenticateSession, authenticateAdmin } from "../middleware/auth.js";
import {
  authenticateUser,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserStats,
} from "../db/users.js";
import { createSession, deleteSession } from "../db/sessions.js";
import {
  getAllApiKeys,
  getApiKeyById,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  getApiKeyStats,
} from "../db/api-keys.js";
import {
  getAllProviders,
  getProviderById,
  createProvider,
  updateProvider,
  deleteProvider,
  getProviderStats,
  updateProviderCredentials,
  updateProviderAccountEmail,
  updateProviderUsageData,
} from "../db/providers.js";
import { checkProviderHealth, getPoolStats } from "../pool/manager.js";
import { getConfig, updateConfig } from "../config.js";
import { KiroService } from "../kiro/service.js";
import { formatKiroUsage } from "../kiro/usage-formatter.js";
import {
  startSocialAuth,
  startBuilderIDAuth,
  waitForAuth,
  getSessionStatus,
  cancelSession,
  stopCallbackServer,
} from "../kiro/oauth.js";

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
    "Access-Control-Allow-Credentials": "true",
  });
  res.end(JSON.stringify(data));
}

/**
 * 发送错误响应
 * @param {Object} res 响应对象
 * @param {number} status 状态码
 * @param {string} message 错误消息
 */
function sendError(res, status, message) {
  sendJson(res, status, { success: false, error: message });
}

/**
 * 发送成功响应
 * @param {Object} res 响应对象
 * @param {Object} data 数据
 */
function sendSuccess(res, data = {}) {
  sendJson(res, 200, { success: true, ...data });
}

/**
 * 从 URL 中提取 ID
 * @param {string} path URL 路径
 * @param {string} prefix 前缀
 * @returns {number|null}
 */
function extractId(path, prefix) {
  const match = path.match(new RegExp(`^${prefix}/(\\d+)`));
  return match ? parseInt(match[1], 10) : null;
}

// ==================== 认证相关 ====================

/**
 * 处理登录
 */
async function handleLogin(req, res) {
  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const { username, password } = body;

  if (!username || !password) {
    return sendError(res, 400, "Username and password are required");
  }

  const user = authenticateUser(username, password);
  if (!user) {
    return sendError(res, 401, "Invalid username or password");
  }

  const config = getConfig();
  const session = createSession(user.id, config.sessionExpireHours || 24);

  // 设置 Cookie
  res.setHeader(
    "Set-Cookie",
    `session_token=${session.token}; Path=/; HttpOnly; SameSite=Strict`,
  );

  sendSuccess(res, {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    token: session.token,
    expiresAt: session.expiresAt,
  });
}

/**
 * 处理登出
 */
async function handleLogout(req, res) {
  const auth = authenticateSession(req, res);
  if (auth.success) {
    // 从 Cookie 或 Header 获取 token 并删除
    const cookieHeader = req.headers["cookie"];
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split("=");
        acc[key] = value;
        return acc;
      }, {});
      if (cookies["session_token"]) {
        deleteSession(cookies["session_token"]);
      }
    }
  }

  // 清除 Cookie
  res.setHeader("Set-Cookie", "session_token=; Path=/; HttpOnly; Max-Age=0");
  sendSuccess(res, { message: "Logged out successfully" });
}

/**
 * 获取当前用户信息
 */
async function handleMe(req, res) {
  const auth = authenticateSession(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  sendSuccess(res, {
    user: {
      id: auth.session.userId,
      username: auth.session.username,
      role: auth.session.role,
    },
  });
}

// ==================== 用户管理 ====================

async function handleGetUsers(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const users = getAllUsers();
  sendSuccess(res, { users });
}

async function handleGetUser(req, res, id) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const user = getUserById(id);
  if (!user) {
    return sendError(res, 404, "User not found");
  }

  sendSuccess(res, { user });
}

async function handleCreateUser(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const { username, password, role, isActive } = body;

  if (!username || !password) {
    return sendError(res, 400, "Username and password are required");
  }

  try {
    const user = createUser({ username, password, role, isActive });
    sendSuccess(res, { user });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleUpdateUser(req, res, id) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const user = updateUser(id, body);
  if (!user) {
    return sendError(res, 404, "User not found");
  }

  sendSuccess(res, { user });
}

async function handleDeleteUser(req, res, id) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  // 不能删除自己
  if (auth.session.userId === id) {
    return sendError(res, 400, "Cannot delete yourself");
  }

  const deleted = deleteUser(id);
  if (!deleted) {
    return sendError(res, 404, "User not found");
  }

  sendSuccess(res, { message: "User deleted successfully" });
}

// ==================== API Key 管理 ====================

async function handleGetApiKeys(req, res) {
  const auth = authenticateSession(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  // 管理员可以看所有，普通用户只能看自己的
  let apiKeys;
  if (auth.session.role === "admin") {
    apiKeys = getAllApiKeys();
  } else {
    apiKeys = getAllApiKeys().filter((k) => k.user_id === auth.session.userId);
  }

  sendSuccess(res, { apiKeys });
}

async function handleGetApiKey(req, res, id) {
  const auth = authenticateSession(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const apiKey = getApiKeyById(id);
  if (!apiKey) {
    return sendError(res, 404, "API Key not found");
  }

  // 检查权限
  if (auth.session.role !== "admin" && apiKey.user_id !== auth.session.userId) {
    return sendError(res, 403, "Access denied");
  }

  sendSuccess(res, { apiKey });
}

async function handleCreateApiKey(req, res) {
  const auth = authenticateSession(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const { name, dailyLimit, userId } = body;

  // 普通用户只能为自己创建
  const targetUserId =
    auth.session.role === "admin"
      ? userId || auth.session.userId
      : auth.session.userId;

  const apiKey = createApiKey({
    name,
    dailyLimit,
    userId: targetUserId,
  });

  sendSuccess(res, { apiKey });
}

async function handleUpdateApiKey(req, res, id) {
  const auth = authenticateSession(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const existing = getApiKeyById(id);
  if (!existing) {
    return sendError(res, 404, "API Key not found");
  }

  // 检查权限
  if (
    auth.session.role !== "admin" &&
    existing.user_id !== auth.session.userId
  ) {
    return sendError(res, 403, "Access denied");
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const apiKey = updateApiKey(id, body);
  sendSuccess(res, { apiKey });
}

async function handleDeleteApiKey(req, res, id) {
  const auth = authenticateSession(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const existing = getApiKeyById(id);
  if (!existing) {
    return sendError(res, 404, "API Key not found");
  }

  // 检查权限
  if (
    auth.session.role !== "admin" &&
    existing.user_id !== auth.session.userId
  ) {
    return sendError(res, 403, "Access denied");
  }

  deleteApiKey(id);
  sendSuccess(res, { message: "API Key deleted successfully" });
}

// ==================== 提供商管理 ====================

async function handleGetProviders(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const providers = getAllProviders();
  // 不返回凭据
  const safeProviders = providers.map((p) => {
    const { credentials, ...safe } = p;
    return safe;
  });

  sendSuccess(res, { providers: safeProviders });
}

async function handleGetProvider(req, res, id) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const provider = getProviderById(id);
  if (!provider) {
    return sendError(res, 404, "Provider not found");
  }

  // 不返回凭据
  const { credentials, ...safe } = provider;
  sendSuccess(res, { provider: safe });
}

async function handleCreateProvider(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const { name, region, credentials, checkHealth, checkModelName } = body;

  if (!credentials) {
    return sendError(res, 400, "Credentials are required");
  }

  try {
    const provider = createProvider({
      name,
      region,
      credentials:
        typeof credentials === "string"
          ? credentials
          : JSON.stringify(credentials),
      checkHealth,
      checkModelName,
    });

    // 不返回凭据
    const { credentials: _, ...safe } = provider;
    sendSuccess(res, { provider: safe });
  } catch (e) {
    sendError(res, 400, e.message);
  }
}

async function handleUpdateProvider(req, res, id) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  // 如果更新凭据，确保是字符串
  if (body.credentials && typeof body.credentials !== "string") {
    body.credentials = JSON.stringify(body.credentials);
  }

  const provider = updateProvider(id, body);
  if (!provider) {
    return sendError(res, 404, "Provider not found");
  }

  // 不返回凭据
  const { credentials, ...safe } = provider;
  sendSuccess(res, { provider: safe });
}

async function handleDeleteProvider(req, res, id) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const deleted = deleteProvider(id);
  if (!deleted) {
    return sendError(res, 404, "Provider not found");
  }

  sendSuccess(res, { message: "Provider deleted successfully" });
}

async function handleProviderHealthCheck(req, res, id) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const provider = getProviderById(id);
  if (!provider) {
    return sendError(res, 404, "Provider not found");
  }

  try {
    const isHealthy = await checkProviderHealth(id);
    sendSuccess(res, { healthy: isHealthy });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

// ==================== OAuth 认证 ====================

/**
 * 启动 Social Auth (Google/GitHub)
 */
async function handleStartSocialAuth(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const { provider, region } = body;

  if (!provider || !["google", "github"].includes(provider)) {
    return sendError(res, 400, 'Provider must be "google" or "github"');
  }

  try {
    const result = await startSocialAuth(provider, region || "us-east-1");
    sendSuccess(res, {
      sessionId: result.sessionId,
      authUrl: result.authUrl,
      state: result.state,
      message:
        "Please open the authUrl in a browser to complete authentication",
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/**
 * 启动 Builder ID 认证
 */
async function handleStartBuilderIDAuth(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const { region } = body;

  try {
    const result = await startBuilderIDAuth(region || "us-east-1");
    sendSuccess(res, {
      sessionId: result.sessionId,
      authUrl: result.authUrl,
      userCode: result.userCode,
      expiresIn: result.expiresIn,
      message:
        "Please open the authUrl and enter the userCode to complete authentication",
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/**
 * 获取 OAuth 会话状态
 */
async function handleGetOAuthStatus(req, res, sessionId) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const status = getSessionStatus(sessionId);
  if (!status) {
    return sendError(res, 404, "OAuth session not found");
  }

  sendSuccess(res, { session: status });
}

/**
 * 等待 OAuth 完成并创建提供商
 */
async function handleCompleteOAuth(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  const { sessionId, name, checkHealth, checkModelName, timeout } = body;

  if (!sessionId) {
    return sendError(res, 400, "sessionId is required");
  }

  try {
    // 等待认证完成
    const credentials = await waitForAuth(sessionId, timeout || 300000);

    // 创建提供商
    const provider = createProvider({
      name: name || `Kiro ${credentials.authMethod} Provider`,
      region: credentials.region || "us-east-1",
      credentials: JSON.stringify(credentials),
      checkHealth: checkHealth !== false,
      checkModelName,
    });

    // 不返回凭据
    const { credentials: _, ...safe } = provider;
    sendSuccess(res, {
      provider: safe,
      message: "OAuth authentication completed and provider created",
    });
  } catch (e) {
    sendError(res, 500, e.message);
  }
}

/**
 * 取消 OAuth 会话
 */
async function handleCancelOAuth(req, res, sessionId) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const cancelled = cancelSession(sessionId);
  if (!cancelled) {
    return sendError(res, 404, "OAuth session not found");
  }

  sendSuccess(res, { message: "OAuth session cancelled" });
}

// ==================== 统计和配置 ====================

async function handleGetStats(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const userStats = getUserStats();
  const apiKeyStats = getApiKeyStats();
  const providerStats = getProviderStats();
  const poolStats = getPoolStats();

  sendSuccess(res, {
    users: userStats,
    apiKeys: apiKeyStats,
    providers: providerStats,
    pool: poolStats,
  });
}

async function handleGetConfig(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const config = getConfig();
  // 不返回敏感配置
  const { adminPassword, ...safeConfig } = config;
  sendSuccess(res, { config: safeConfig });
}

async function handleUpdateConfig(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return sendError(res, 400, e.message);
  }

  // 不允许通过 API 修改某些配置
  delete body.dbPath;

  const config = updateConfig(body);
  const { adminPassword, ...safeConfig } = config;
  sendSuccess(res, { config: safeConfig });
}

// ==================== 用量查询 ====================

/**
 * 获取所有提供商的用量信息（优先使用缓存）
 */
async function handleGetUsage(req, res) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const providers = getAllProviders().filter((p) => !p.is_disabled);
  const usageResults = [];

  for (const provider of providers) {
    // 优先使用缓存数据
    if (provider.last_usage_sync && provider.cached_usage_data) {
      try {
        const cachedUsage = JSON.parse(provider.cached_usage_data);
        usageResults.push({
          providerId: provider.id,
          name: provider.name || `Provider #${provider.id}`,
          region: provider.region,
          usage: cachedUsage,
          lastSync: provider.last_usage_sync,
          cached: true,
        });
        continue;
      } catch (e) {
        // 缓存数据解析失败，标记需要刷新
      }
    }

    // 没有缓存数据，返回空数据提示需要刷新
    usageResults.push({
      providerId: provider.id,
      name: provider.name || `Provider #${provider.id}`,
      region: provider.region,
      usage: null,
      lastSync: null,
      cached: false,
      needsRefresh: true,
    });
  }

  sendSuccess(res, { providers: usageResults });
}

/**
 * 刷新单个提供商的用量信息（强制从远程获取）
 */
async function handleRefreshProviderUsage(req, res, providerId) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const provider = getProviderById(providerId);
  if (!provider) {
    return sendError(res, 404, "Provider not found");
  }

  try {
    // 解析凭据
    let credentials;
    try {
      credentials = JSON.parse(provider.credentials);
    } catch (e) {
      return sendError(res, 400, "Invalid credentials format");
    }

    // 创建服务实例并获取用量
    const service = new KiroService(credentials, provider.region);
    await service.initialize();
    const rawUsage = await service.getUsageLimits();
    const usage = formatKiroUsage(rawUsage);

    // 检查 token 是否被刷新，如果是则保存新凭据
    if (
      service.accessToken !== credentials.accessToken ||
      service.refreshToken !== credentials.refreshToken
    ) {
      const updatedCredentials = {
        ...credentials,
        accessToken: service.accessToken,
        refreshToken: service.refreshToken,
        profileArn: service.profileArn,
        expiresAt: service.expiresAt,
      };
      updateProviderCredentials(provider.id, updatedCredentials);
      console.log(`[Usage] Updated credentials for provider ${provider.id}`);
    }

    // 更新账户邮箱缓存
    if (usage?.user?.email && usage.user.email !== provider.account_email) {
      updateProviderAccountEmail(provider.id, usage.user.email);
      console.log(
        `[Usage] Updated account email for provider ${provider.id}: ${usage.user.email}`,
      );
    }

    // 保存用量缓存到数据库
    updateProviderUsageData(provider.id, usage);

    sendSuccess(res, {
      providerId: provider.id,
      name: provider.name || `Provider #${provider.id}`,
      region: provider.region,
      usage: usage,
      lastSync: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
}

/**
 * 获取单个提供商的用量信息（优先使用缓存）
 */
async function handleGetProviderUsage(req, res, providerId) {
  const auth = authenticateAdmin(req, res);
  if (!auth.success) {
    return sendError(res, 401, auth.error);
  }

  const provider = getProviderById(providerId);
  if (!provider) {
    return sendError(res, 404, "Provider not found");
  }

  // 优先返回缓存数据
  if (provider.last_usage_sync && provider.cached_usage_data) {
    try {
      const cachedUsage = JSON.parse(provider.cached_usage_data);
      return sendSuccess(res, {
        providerId: provider.id,
        name: provider.name || `Provider #${provider.id}`,
        region: provider.region,
        usage: cachedUsage,
        lastSync: provider.last_usage_sync,
        cached: true,
      });
    } catch (e) {
      // 缓存数据解析失败，返回需要刷新
    }
  }

  // 没有缓存，返回需要刷新
  sendSuccess(res, {
    providerId: provider.id,
    name: provider.name || `Provider #${provider.id}`,
    region: provider.region,
    usage: null,
    lastSync: null,
    cached: false,
    needsRefresh: true,
  });
}

/**
 * 管理 API 路由处理器
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 * @returns {boolean} 是否处理了请求
 */
export async function handleAdminRoutes(req, res) {
  const { method, url } = req;
  const path = url.split("?")[0];

  // CORS 预检请求
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return true;
  }

  // 认证路由
  if (path === "/api/login" && method === "POST") {
    await handleLogin(req, res);
    return true;
  }

  if (path === "/api/logout" && method === "POST") {
    await handleLogout(req, res);
    return true;
  }

  if (path === "/api/me" && method === "GET") {
    await handleMe(req, res);
    return true;
  }

  // 用户路由
  if (path === "/api/users" && method === "GET") {
    await handleGetUsers(req, res);
    return true;
  }

  if (path === "/api/users" && method === "POST") {
    await handleCreateUser(req, res);
    return true;
  }

  const userId = extractId(path, "/api/users");
  if (userId) {
    if (method === "GET") {
      await handleGetUser(req, res, userId);
      return true;
    }
    if (method === "PUT") {
      await handleUpdateUser(req, res, userId);
      return true;
    }
    if (method === "DELETE") {
      await handleDeleteUser(req, res, userId);
      return true;
    }
  }

  // API Key 路由
  if (path === "/api/api-keys" && method === "GET") {
    await handleGetApiKeys(req, res);
    return true;
  }

  if (path === "/api/api-keys" && method === "POST") {
    await handleCreateApiKey(req, res);
    return true;
  }

  const apiKeyId = extractId(path, "/api/api-keys");
  if (apiKeyId) {
    if (method === "GET") {
      await handleGetApiKey(req, res, apiKeyId);
      return true;
    }
    if (method === "PUT") {
      await handleUpdateApiKey(req, res, apiKeyId);
      return true;
    }
    if (method === "DELETE") {
      await handleDeleteApiKey(req, res, apiKeyId);
      return true;
    }
  }

  // 提供商路由
  if (path === "/api/providers" && method === "GET") {
    await handleGetProviders(req, res);
    return true;
  }

  if (path === "/api/providers" && method === "POST") {
    await handleCreateProvider(req, res);
    return true;
  }

  const providerId = extractId(path, "/api/providers");
  if (providerId) {
    if (path.endsWith("/health-check") && method === "POST") {
      await handleProviderHealthCheck(req, res, providerId);
      return true;
    }
    if (method === "GET") {
      await handleGetProvider(req, res, providerId);
      return true;
    }
    if (method === "PUT") {
      await handleUpdateProvider(req, res, providerId);
      return true;
    }
    if (method === "DELETE") {
      await handleDeleteProvider(req, res, providerId);
      return true;
    }
  }

  // 统计和配置路由
  if (path === "/api/stats" && method === "GET") {
    await handleGetStats(req, res);
    return true;
  }

  if (path === "/api/config" && method === "GET") {
    await handleGetConfig(req, res);
    return true;
  }

  if (path === "/api/config" && method === "PUT") {
    await handleUpdateConfig(req, res);
    return true;
  }

  // 用量查询路由
  if (path === "/api/usage" && method === "GET") {
    await handleGetUsage(req, res);
    return true;
  }

  // 单个提供商用量查询
  const usageProviderMatch = path.match(/^\/api\/usage\/(\d+)$/);
  if (usageProviderMatch) {
    const providerId = parseInt(usageProviderMatch[1], 10);
    if (method === "GET") {
      await handleGetProviderUsage(req, res, providerId);
      return true;
    }
    if (method === "POST") {
      // POST 用于强制刷新
      await handleRefreshProviderUsage(req, res, providerId);
      return true;
    }
  }

  // OAuth 路由
  if (path === "/api/oauth/social" && method === "POST") {
    await handleStartSocialAuth(req, res);
    return true;
  }

  if (path === "/api/oauth/builder-id" && method === "POST") {
    await handleStartBuilderIDAuth(req, res);
    return true;
  }

  if (path === "/api/oauth/complete" && method === "POST") {
    await handleCompleteOAuth(req, res);
    return true;
  }

  // OAuth 会话状态和取消
  const oauthSessionMatch = path.match(
    /^\/api\/oauth\/session\/([a-zA-Z0-9-]+)$/,
  );
  if (oauthSessionMatch) {
    const sessionId = oauthSessionMatch[1];
    if (method === "GET") {
      await handleGetOAuthStatus(req, res, sessionId);
      return true;
    }
    if (method === "DELETE") {
      await handleCancelOAuth(req, res, sessionId);
      return true;
    }
  }

  return false;
}

export default {
  handleAdminRoutes,
};
